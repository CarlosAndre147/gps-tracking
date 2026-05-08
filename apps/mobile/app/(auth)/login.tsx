import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, router } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";

import { theme } from "@/constants/theme";
import { AuthRequestError, useAuthStore } from "@/store/auth.store";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

type FormValues = z.infer<typeof schema>;

function normalizeLoginError(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (error.code === "RATE_LIMITED" || error.status === 429) {
      return "Voce fez muitas tentativas em pouco tempo. Por seguranca, o acesso foi bloqueado temporariamente. Aguarde alguns minutos antes de tentar novamente.";
    }
    if (error.code === "UNAUTHORIZED" || error.status === 401) {
      return "E-mail ou senha incorretos. Confira os dados e tente novamente.";
    }
    if (error.code === "NETWORK_ERROR" || error.status === 0) {
      return "Sem conexao com a API. Verifique sua internet e tente novamente.";
    }
    return error.message || "Nao foi possivel entrar agora.";
  }
  if (error instanceof Error && error.message.includes("429")) {
    return "Voce fez muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  return "Nao foi possivel entrar.";
}

export default function LoginScreen() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await useAuthStore.getState().login(values.email, values.password);
      router.replace("/");
    } catch (e) {
      setSubmitError(normalizeLoginError(e));
    }
  });

  if (bootstrapped && accessToken) {
    return <Redirect href="/" />;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.logo}>GPS Tracker</Text>
          <Text style={styles.subtitle}>Entre com sua conta</Text>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="E-mail"
                placeholderTextColor={theme.text.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                onBlur={onBlur}
                onChangeText={(text) => {
                  if (submitError) setSubmitError(null);
                  onChange(text);
                }}
                value={value}
              />
            )}
          />
          {errors.email ? <Text style={styles.fieldError}>{errors.email.message}</Text> : null}

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput, errors.password && styles.inputError]}
                  placeholder="Senha"
                  placeholderTextColor={theme.text.muted}
                  secureTextEntry={!showPassword}
                  onBlur={onBlur}
                  onChangeText={(text) => {
                    if (submitError) setSubmitError(null);
                    onChange(text);
                  }}
                  value={value}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff size={18} color={theme.text.secondary} />
                  ) : (
                    <Eye size={18} color={theme.text.secondary} />
                  )}
                </Pressable>
              </View>
            )}
          />
          {errors.password ? <Text style={styles.fieldError}>{errors.password.message}</Text> : null}

          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

          <Pressable
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={() => void onSubmit()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.layout.headerBg} />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </Pressable>

          <Pressable onPress={() => setForgotModalVisible(true)} hitSlop={8}>
            <Text style={styles.hint}>Esqueci minha senha</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={forgotModalVisible}
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setForgotModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Recuperar senha</Text>
            <Text style={styles.modalText}>
              Para recuperar sua senha, entre em contato com o encarregado da sua empresa.
            </Text>
            <Pressable style={styles.modalButton} onPress={() => setForgotModalVisible(false)}>
              <Text style={styles.modalButtonText}>Entendi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.layout.headerBg },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: theme.layout.cardBg,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.layout.border,
  },
  logo: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.brand.primary,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.text.secondary,
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.layout.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text.main,
    marginTop: 12,
  },
  inputError: {
    borderColor: theme.status.error,
  },
  passwordWrap: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 12,
    bottom: 0,
    justifyContent: "center",
  },
  fieldError: {
    color: theme.status.error,
    fontSize: 13,
    marginTop: 4,
  },
  submitError: {
    color: theme.status.error,
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  button: {
    backgroundColor: theme.brand.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: theme.layout.headerBg,
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    marginTop: 16,
    textAlign: "center",
    color: theme.text.muted,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#00000066",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.layout.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.layout.border,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.text.main,
  },
  modalText: {
    color: theme.text.secondary,
    lineHeight: 20,
  },
  modalButton: {
    marginTop: 8,
    alignSelf: "flex-end",
    backgroundColor: theme.brand.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalButtonText: {
    color: theme.layout.headerBg,
    fontWeight: "600",
  },
});
