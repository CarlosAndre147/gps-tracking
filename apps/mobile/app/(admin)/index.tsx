import { useQuery } from "@tanstack/react-query";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Callout, Marker, type Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { theme } from "@/constants/theme";
import { api } from "@/lib/api";
import { isApiError, unwrapData } from "@/lib/api-result";
import { apiBaseUrl } from "@/lib/env";
import { useAuthStore } from "@/store/auth.store";

type ActiveUserRow = {
  userId: string;
  name: string;
  email: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  timestamp: number | null;
  isActive: boolean;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

const INITIAL_REGION: Region = {
  latitude: -23.55,
  longitude: -46.63,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

function wsTrackingUrl(accessToken: string): string {
  const base = apiBaseUrl().replace(/\/$/, "");
  const wsBase = base.startsWith("https://")
    ? base.replace(/^https:\/\//, "wss://")
    : base.replace(/^http:\/\//, "ws://");
  return `${wsBase}/ws/tracking?token=${encodeURIComponent(accessToken)}`;
}

export default function AdminMapScreen() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  const logout = useAuthStore((s) => s.logout);
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["25%", "60%"], []);
  const [rows, setRows] = useState<ActiveUserRow[]>([]);

  const activeUsersQuery = useQuery({
    queryKey: ["tracking-active-users"],
    queryFn: async () => {
      const res = await api.tracking["active-users"].get();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error("Falha ao carregar usuários ativos");
      }
      return unwrapData<ActiveUserRow[]>(body);
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!activeUsersQuery.data) return;
    setRows(activeUsersQuery.data);
  }, [activeUsersQuery.data]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let disposed = false;
    let ws: WebSocket | null = null;

    const connect = async () => {
      if (disposed) return;
      let tokenToUse = accessToken;
      try {
        await refreshSession();
        tokenToUse = useAuthStore.getState().accessToken ?? tokenToUse;
      } catch {
        /* mantém token atual se refresh falhar */
      }
      if (!tokenToUse || disposed) return;
      const url = wsTrackingUrl(tokenToUse);
      ws = new WebSocket(url);

      ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const msg = parsed as { type?: string; data?: unknown; userId?: unknown; timestamp?: unknown };

      if (msg.type === "SNAPSHOT") {
        const data = msg.data as { locationsByUserId?: Record<string, ActiveUserRow | null> } | undefined;
        const byUserId = data?.locationsByUserId;
        if (!byUserId || typeof byUserId !== "object") return;
        setRows((prev) =>
          prev.map((row) => {
            const live = byUserId[row.userId];
            if (!live) return row;
            return {
              ...row,
              lat: typeof live.lat === "number" ? live.lat : row.lat,
              lng: typeof live.lng === "number" ? live.lng : row.lng,
              accuracy: typeof live.accuracy === "number" ? live.accuracy : row.accuracy,
              timestamp: typeof live.timestamp === "number" ? live.timestamp : row.timestamp,
              isActive: typeof live.isActive === "boolean" ? live.isActive : row.isActive,
            };
          }),
        );
        return;
      }

      if (msg.type === "USER_LOCATION") {
        const payload = parsed as {
          userId?: string;
          lat?: number;
          lng?: number;
          accuracy?: number | null;
          timestamp?: number;
          isActive?: boolean;
        };
        if (!payload.userId) return;
        setRows((prev) =>
          prev.map((row) =>
            row.userId === payload.userId
              ? {
                  ...row,
                  lat: typeof payload.lat === "number" ? payload.lat : row.lat,
                  lng: typeof payload.lng === "number" ? payload.lng : row.lng,
                  accuracy: typeof payload.accuracy === "number" ? payload.accuracy : row.accuracy,
                  timestamp: typeof payload.timestamp === "number" ? payload.timestamp : row.timestamp,
                  isActive: typeof payload.isActive === "boolean" ? payload.isActive : row.isActive,
                }
              : row,
          ),
        );
        return;
      }

      if (msg.type === "TRACKING_STARTED" || msg.type === "TRACKING_STOPPED") {
        const userId = typeof msg.userId === "string" ? msg.userId : "";
        if (!userId) return;
        const isActive = msg.type === "TRACKING_STARTED";
        const timestamp = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();
        setRows((prev) =>
          prev.map((row) => (row.userId === userId ? { ...row, isActive, timestamp } : row)),
        );
      }
      };
    };

    void connect();

    return () => {
      disposed = true;
      ws?.close();
    };
  }, [accessToken, refreshSession]);

  const focusUser = useCallback((u: ActiveUserRow) => {
    if (u.lat == null || u.lng == null) return;
    mapRef.current?.animateToRegion(
      {
        latitude: u.lat,
        longitude: u.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      600,
    );
  }, []);

  return (
    <View style={styles.flex}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFillObject} initialRegion={INITIAL_REGION}>
        {rows.map((u) =>
          u.lat != null && u.lng != null ? (
            <Marker
              key={u.userId}
              coordinate={{ latitude: u.lat, longitude: u.lng }}
              pinColor={theme.charts[0]}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{u.name}</Text>
                  <Text style={styles.calloutSub}>{u.email}</Text>
                  <Text style={styles.calloutSub}>{u.isActive ? "Rastreio ativo" : "Inativo"}</Text>
                </View>
              </Callout>
            </Marker>
          ) : null,
        )}
      </MapView>

      <SafeAreaView style={styles.topBar} edges={["top", "left", "right"]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Mapa ao vivo</Text>
            <Text style={styles.headerSub}>{user?.name}</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sair</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <BottomSheet ref={sheetRef} index={0} snapPoints={snapPoints} enablePanDownToClose={false}>
        <BottomSheetFlatList
          data={rows}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.listPad}
          renderItem={({ item }) => (
            <Pressable style={styles.listItem} onPress={() => focusUser(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={styles.listText}>
                <Text style={styles.listName}>{item.name}</Text>
                <Text style={styles.listMeta}>
                  {item.isActive ? "Ativo" : "Inativo"}
                  {item.timestamp != null
                    ? ` · ${formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: ptBR })}`
                    : ""}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.layout.bodyBg },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.layout.headerBg,
    borderBottomWidth: 1,
    borderColor: theme.layout.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: theme.text.main },
  headerSub: { fontSize: 13, color: theme.text.secondary },
  logoutBtn: { padding: 8 },
  logoutText: { color: theme.status.error, fontWeight: "600" },
  listPad: { paddingBottom: 24 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: theme.layout.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.brand.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: theme.text.inverted, fontWeight: "700" },
  listText: { flex: 1 },
  listName: { fontSize: 16, fontWeight: "600", color: theme.text.main },
  listMeta: { fontSize: 13, color: theme.text.secondary, marginTop: 2 },
  callout: { padding: 8, maxWidth: 220 },
  calloutTitle: { fontWeight: "700", fontSize: 15 },
  calloutSub: { fontSize: 13, color: "#444", marginTop: 2 },
});
