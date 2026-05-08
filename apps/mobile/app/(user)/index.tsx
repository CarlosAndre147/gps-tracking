import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Info, LogOut, Satellite } from "lucide-react-native";
import { useMemo, useRef, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { theme } from "@/constants/theme";
import { api } from "@/lib/api";
import { isApiError, unwrapPaginated } from "@/lib/api-result";
import { useTracking } from "@/hooks/useTracking";
import { useAuthStore } from "@/store/auth.store";

type SessionRow = {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  durationMs: number | null;
  source: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Primeiro e último nome para o header (ex.: "Maria Silva Santos" → "Maria Santos"). */
function firstLastDisplayName(name: string | undefined): string {
  if (name == null || !name.trim()) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]!} ${parts[parts.length - 1]!}`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "<1 min";
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}min`;
  }
  return `${m} min`;
}

/** Dia da semana em pt-BR sem "-feira", com primeira letra maiúscula (ex.: Segunda). */
function weekdayLabelPt(date: Date): string {
  const raw = format(date, "EEEE", { locale: ptBR }).replace(/-feira$/i, "");
  if (!raw) return raw;
  return raw.charAt(0).toLocaleUpperCase("pt-BR") + raw.slice(1).toLocaleLowerCase("pt-BR");
}

function formatHistoryClosedRange(startedAt: string, stoppedAt: string): string {
  const startD = new Date(startedAt);
  const endD = new Date(stoppedAt);
  if (isSameDay(startD, endD)) {
    return `${format(startD, "dd/MM/yy", { locale: ptBR })}, ${weekdayLabelPt(startD)} · ${format(startD, "HH:mm", { locale: ptBR })}–${format(endD, "HH:mm", { locale: ptBR })}`;
  }
  return `${format(startD, "dd/MM/yy HH:mm", { locale: ptBR })}, ${weekdayLabelPt(startD)} – ${format(endD, "dd/MM/yy HH:mm", { locale: ptBR })}, ${weekdayLabelPt(endD)}`;
}

export default function UserDashboard() {
  const user = useAuthStore((s) => s.user);
  const companies = useAuthStore((s) => s.companies);
  const logout = useAuthStore((s) => s.logout);
  const {
    isTracking,
    startTracking,
    stopTracking,
    permissionState,
    permissionPrimerVisible,
    isPermissionFlowActive,
    confirmPermissionPrimer,
    cancelPermissionPrimer,
  } = useTracking();
  const queryClient = useQueryClient();
  const spin = useRef(new Animated.Value(0)).current;
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!isTracking) {
      spin.setValue(0);
      return;
    }
    spin.setValue(0);
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => {
      anim.stop();
      spin.setValue(0);
    };
  }, [isTracking, spin]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const historyQuery = useInfiniteQuery({
    queryKey: ["tracking-history"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.tracking.history.get({ query: { page: pageParam, limit: 10 } });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error("Falha ao carregar histórico");
      }
      return unwrapPaginated<SessionRow>(body);
    },
    getNextPageParam: (last) => {
      const { page, limit, total } = last.meta;
      const loaded = page * limit;
      return loaded < total ? page + 1 : undefined;
    },
    refetchInterval: 15_000,
  });

  const sessions = useMemo(
    () => historyQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [historyQuery.data],
  );

  const headerDisplayName = useMemo(() => firstLastDisplayName(user?.name), [user?.name]);

  const permissionHint =
    isPermissionFlowActive
      ? null
      : permissionState === "denied"
      ? "Permissão de localização negada. Ative nas configurações do sistema."
      : permissionState === "foreground-only"
        ? "Sem permissão em segundo plano: o rastreio funciona só com o app aberto."
        : null;
  const [isToggling, setIsToggling] = useState(false);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);
  const [companiesModalVisible, setCompaniesModalVisible] = useState(false);
  const [permissionHelpVisible, setPermissionHelpVisible] = useState(false);

  useEffect(() => {
    if (isTracking && permissionState === "foreground-only") {
      setPermissionHelpVisible(true);
    }
  }, [isTracking, permissionState]);

  useEffect(() => {
    if (!isTracking || permissionState === "granted") {
      setPermissionHelpVisible(false);
    }
  }, [isTracking, permissionState]);

  const openAppSettings = () => {
    void Linking.openSettings();
  };

  const confirmStopTracking = () => {
    void (async () => {
      setStopConfirmVisible(false);
      setIsToggling(true);
      try {
        await stopTracking();
        await queryClient.invalidateQueries({ queryKey: ["tracking-history"] });
      } catch {
        /* estado local permanece; próximo sync corrige */
      } finally {
        setIsToggling(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 160;
          if (nearBottom && historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
            void historyQuery.fetchNextPage();
          }
        }}
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user ? initials(user.name) : "?"}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={2}>
              {headerDisplayName}
            </Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.logoutBtn}>
            <LogOut size={16} color={theme.text.main} />
            <Text style={styles.logoutText}>Deslogar</Text>
          </Pressable>
        </View>

        <View style={[styles.card, isTracking && styles.cardActive]}>
          <Pressable
            style={({ pressed }) => [styles.cardInfoBtn, pressed && styles.cardInfoBtnPressed]}
            onPress={() => setCompaniesModalVisible(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Informações do app e empresas vinculadas"
          >
            <Info size={18} color={theme.brand.accent} strokeWidth={2} />
          </Pressable>
          <Animated.View
            style={[styles.satelliteWrap, { transform: [{ rotate: spinInterpolate }] }]}
            collapsable={false}
          >
            <View style={styles.satelliteInner} collapsable={false}>
              <Satellite size={48} color={isTracking ? theme.brand.primary : theme.text.muted} />
            </View>
          </Animated.View>
          <Text style={styles.cardTitle}>RASTREAMENTO DE LOCALIZAÇÃO</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, !isTracking ? styles.statusPillInactive : styles.statusPillMuted]}>
              <Text style={[styles.statusPillText, !isTracking && styles.statusPillTextInactive]}>
                Inativo
              </Text>
            </View>
            <View style={[styles.statusPill, isTracking ? styles.statusPillActive : styles.statusPillMuted]}>
              <Text style={[styles.statusPillText, isTracking && styles.statusPillTextActive]}>Ativo</Text>
            </View>
          </View>
          <Pressable
            style={[
              styles.trackingButton,
              isTracking ? styles.trackingButtonStop : styles.trackingButtonStart,
              isToggling && styles.trackingButtonDisabled,
            ]}
            onPress={() => {
              if (isTracking) {
                setStopConfirmVisible(true);
                return;
              }
              void (async () => {
                setIsToggling(true);
                try {
                  await startTracking();
                  await queryClient.invalidateQueries({ queryKey: ["tracking-history"] });
                } catch {
                  /* estado local permanece; próximo sync corrige */
                } finally {
                  setIsToggling(false);
                }
              })();
            }}
            disabled={isToggling}
          >
            <Text style={styles.trackingButtonText}>
              {isToggling
                ? "Atualizando..."
                : isTracking
                  ? "Parar rastreamento"
                  : "Iniciar rastreamento"}
            </Text>
          </Pressable>
          {permissionHint ? <Text style={styles.warn}>{permissionHint}</Text> : null}
          {isTracking && permissionState === "foreground-only" && !isPermissionFlowActive ? (
            <Pressable
              style={({ pressed }) => [
                styles.fixPermissionButton,
                pressed && styles.fixPermissionButtonPressed,
              ]}
              onPress={() => setPermissionHelpVisible(true)}
            >
              <Text style={styles.fixPermissionButtonText}>Corrigir permissão</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Histórico</Text>
        {historyQuery.isLoading ? (
          <ActivityIndicator color={theme.brand.primary} style={{ marginTop: 16 }} />
        ) : sessions.length === 0 ? (
          <View style={styles.emptyHistoryCard}>
            <Text style={styles.emptyHistoryTitle}>Nenhum registro por enquanto</Text>
            <Text style={styles.emptyHistoryText}>
              Quando você iniciar o rastreamento, suas sessões vão aparecer aqui.
            </Text>
          </View>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={styles.historyCard}>
              {s.stoppedAt == null ? (
                <>
                  <Text style={styles.historyLiveLine}>
                    Em andamento desde {format(new Date(s.startedAt), "dd/MM/yy", { locale: ptBR })},{" "}
                    {weekdayLabelPt(new Date(s.startedAt))} ·{" "}
                    {format(new Date(s.startedAt), "HH:mm", { locale: ptBR })}
                  </Text>
                  <Text style={styles.historyMetaText}>
                    Duração até agora: {formatDuration(nowTs - new Date(s.startedAt).getTime())}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.historyDate}>
                    {formatHistoryClosedRange(s.startedAt, s.stoppedAt)}
                  </Text>
                  <Text style={styles.historyMetaText}>Duração: {formatDuration(s.durationMs)}</Text>
                </>
              )}
            </View>
          ))
        )}
        {historyQuery.isFetchingNextPage ? (
          <ActivityIndicator color={theme.brand.primary} style={styles.fetchMoreLoader} />
        ) : null}
      </ScrollView>

      <Modal
        transparent
        visible={stopConfirmVisible}
        animationType="fade"
        onRequestClose={() => setStopConfirmVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setStopConfirmVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Parar rastreamento?</Text>
            <Text style={styles.modalText}>
              Você deixará de enviar sua localização até iniciar de novo. Deseja continuar?
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setStopConfirmVisible(false)}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnDanger]} onPress={confirmStopTracking}>
                <Text style={styles.modalBtnDangerText}>Parar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={companiesModalVisible}
        animationType="fade"
        onRequestClose={() => setCompaniesModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCompaniesModalVisible(false)}>
          <Pressable style={styles.modalCardWide} onPress={() => {}}>
            <Text style={styles.modalTitle}>Informações</Text>
            <Text style={styles.modalIntro}>
              Com o rastreamento ligado, sua posição é enviada às empresas da sua conta para apoio à jornada e
              segurança no trabalho.
            </Text>
            <Text style={styles.modalSectionTitle}>Suas empresas</Text>
            {companies.length === 0 ? (
              <Text style={styles.modalText}>Nenhuma empresa associada à sua conta.</Text>
            ) : (
              <>
                <Text style={styles.modalText}>
                  Você está vinculado a {companies.length}{" "}
                  {companies.length === 1 ? "empresa" : "empresas"}:
                </Text>
                <ScrollView style={styles.companiesList} keyboardShouldPersistTaps="handled">
                  {companies.map((c) => (
                    <View key={c.id} style={styles.companyRow}>
                      <Text style={styles.companyName}>{c.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            <Pressable style={styles.modalBtnFull} onPress={() => setCompaniesModalVisible(false)}>
              <Text style={styles.modalBtnPrimaryText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={permissionHelpVisible}
        animationType="fade"
        onRequestClose={() => setPermissionHelpVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPermissionHelpVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Permissão incompleta</Text>
            <Text style={styles.modalText}>
              Para rastrear mesmo em segundo plano, habilite "Permitir o tempo todo" na localização deste app.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setPermissionHelpVisible(false)}
              >
                <Text style={styles.modalBtnSecondaryText}>Agora não</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={() => {
                  setPermissionHelpVisible(false);
                  openAppSettings();
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>Abrir configurações</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={permissionPrimerVisible}
        animationType="fade"
        onRequestClose={cancelPermissionPrimer}
      >
        <Pressable style={styles.modalBackdrop} onPress={cancelPermissionPrimer}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Permissão de localização</Text>
            <Text style={styles.modalText}>
              Para maior segurança e continuidade do rastreio, permita "Localização exata" e "Permitir o tempo
              todo".
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={cancelPermissionPrimer}
              >
                <Text style={styles.modalBtnSecondaryText}>Agora não</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={confirmPermissionPrimer}
              >
                <Text style={styles.modalBtnPrimaryText}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.layout.bodyBg },
  scroll: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.brand.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.text.inverted, fontWeight: "700", fontSize: 16 },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 18, fontWeight: "600", color: theme.text.main },
  logoutBtn: { padding: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  logoutText: { color: theme.text.main, fontWeight: "600" },
  card: {
    backgroundColor: theme.layout.cardBg,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.layout.border,
    marginBottom: 24,
    position: "relative",
  },
  cardInfoBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${theme.brand.accent}4D`,
    backgroundColor: `${theme.brand.accent}14`,
  },
  cardInfoBtnPressed: {
    opacity: 0.92,
    backgroundColor: `${theme.brand.accent}26`,
  },
  satelliteWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  satelliteInner: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  cardActive: {
    borderColor: theme.status.success,
    borderWidth: 2,
    backgroundColor: "#CC8C1C14",
  },
  cardTitle: {
    textAlign: "center",
    marginTop: 12,
    fontWeight: "700",
    color: theme.text.main,
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: "#679AA422",
    borderColor: theme.status.success,
  },
  statusPillInactive: {
    backgroundColor: "#B4845C22",
    borderColor: theme.status.error,
  },
  statusPillMuted: {
    backgroundColor: theme.layout.bodyBg,
    borderColor: theme.layout.border,
  },
  statusPillText: {
    color: theme.text.secondary,
    fontWeight: "600",
  },
  statusPillTextActive: {
    color: theme.status.success,
  },
  statusPillTextInactive: {
    color: theme.status.error,
  },
  trackingButton: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  trackingButtonStart: {
    backgroundColor: theme.status.success,
  },
  trackingButtonStop: {
    backgroundColor: theme.status.error,
  },
  trackingButtonDisabled: {
    opacity: 0.7,
  },
  trackingButtonText: {
    color: theme.layout.headerBg,
    fontSize: 16,
    fontWeight: "700",
  },
  warn: { color: theme.status.warning, marginTop: 12, textAlign: "center" },
  fixPermissionButton: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.brand.primary,
    backgroundColor: `${theme.brand.primary}1A`,
  },
  fixPermissionButtonPressed: {
    opacity: 0.9,
  },
  fixPermissionButtonText: {
    color: theme.brand.primary,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.text.main,
    marginBottom: 8,
  },
  historyCard: {
    backgroundColor: theme.layout.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.layout.border,
    marginBottom: 10,
  },
  historyDate: { color: theme.text.main, fontWeight: "600", flex: 1 },
  historyLiveLine: {
    color: theme.status.success,
    fontWeight: "700",
    fontSize: 13,
  },
  historyMetaText: {
    color: theme.text.secondary,
    fontSize: 13,
    marginTop: 6,
  },
  emptyHistoryCard: {
    backgroundColor: theme.layout.cardBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.layout.border,
  },
  emptyHistoryTitle: {
    color: theme.text.main,
    fontWeight: "600",
    fontSize: 15,
  },
  emptyHistoryText: {
    color: theme.text.secondary,
    marginTop: 6,
    lineHeight: 19,
  },
  fetchMoreLoader: {
    marginTop: 8,
    marginBottom: 16,
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
  modalCardWide: {
    backgroundColor: theme.layout.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.layout.border,
    padding: 20,
    maxHeight: "80%",
    gap: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.text.main,
    marginBottom: 8,
  },
  modalText: {
    color: theme.text.secondary,
    lineHeight: 20,
  },
  modalIntro: {
    color: theme.text.secondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  modalSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.text.main,
    marginBottom: 6,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnSecondary: {
    borderWidth: 1,
    borderColor: theme.layout.border,
    backgroundColor: theme.layout.bodyBg,
  },
  modalBtnSecondaryText: {
    color: theme.text.main,
    fontWeight: "600",
  },
  modalBtnDanger: {
    backgroundColor: theme.status.error,
  },
  modalBtnPrimary: {
    backgroundColor: theme.brand.primary,
  },
  modalBtnDangerText: {
    color: theme.layout.headerBg,
    fontWeight: "700",
  },
  modalBtnFull: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: theme.brand.primary,
  },
  modalBtnPrimaryText: {
    color: theme.layout.headerBg,
    fontWeight: "700",
  },
  companiesList: {
    maxHeight: 220,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.layout.border,
    borderRadius: 10,
    backgroundColor: theme.layout.bodyBg,
  },
  companyRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.layout.border,
  },
  companyName: {
    fontSize: 15,
    color: theme.text.main,
    fontWeight: "600",
  },
});
