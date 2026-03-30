import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Game } from "@fiveaside/contracts";

export type GamePaymentStatus = "paid" | "partial" | "unpaid";

export type PlayerPaymentStatus = {
  playerId: string;
  displayName: string;
  chargeCents: number;
  paidCents: number;
  status: GamePaymentStatus;
};

export type GamePaymentStatusResponse = {
  gameId: string;
  gameDate: string;
  feeCents: number;
  playerStatuses: PlayerPaymentStatus[];
  summary: {
    totalExpectedCents: number;
    totalPaidCents: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
  };
};

export type EnrichedGame = Game & {
  attendanceCount: number;
  paymentStatus?: GamePaymentStatusResponse;
};

export function useDashboardGames() {
  const { data: games, isLoading: isLoadingGames } = useQuery({
    queryKey: ["dashboard", "recent-games"],
    queryFn: async () => {
      const { data } = await api.get<{ data: (Game & { attendanceCount: number })[] }>(
        "/games?limit=5"
      );
      return data.data;
    },
  });

  const paymentQueries = useQueries({
    queries: (games ?? []).map((game) => ({
      queryKey: ["game", "payment-status", game.id],
      queryFn: async () => {
        const { data } = await api.get<GamePaymentStatusResponse>(
          `/games/${game.id}/payment-status`
        );
        return data;
      },
      enabled: !!games,
    })),
  });

  const isLoadingPayments = paymentQueries.some((q) => q.isLoading);

  const enrichedGames: EnrichedGame[] = (games ?? []).map((game, index) => {
    const paymentStatus = paymentQueries[index]?.data;
    return {
      ...game,
      paymentStatus,
    };
  });

  return {
    games: enrichedGames,
    isLoading: isLoadingGames || isLoadingPayments,
  };
}
