import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gameRoutes } from './games.js';
import * as gamesService from '../services/games.js';

vi.mock('../services/games.js', () => ({
  calculateGamePaymentStatus: vi.fn(),
  getLatestGameId: vi.fn(),
}));

vi.mock('../utils/request.js', () => ({
  parseUuidParam: vi.fn((req, reply, name) => req.params[name]),
  parseBody: vi.fn((reply, schema, body) => body),
}));

describe('Games Routes - Latest Unpaid', () => {
    let app: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        app = {
            addHook: vi.fn(),
            requireAuth: vi.fn(),
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
            httpErrors: {
                notFound: (msg: string) => new Error(msg)
            }
        };

        await gameRoutes(app);
    });

    it('returns unpaid players from the latest game', async () => {
        const handler = app.get.mock.calls.find((call: any) => call[0] === '/api/games/latest/unpaid')[1];
        
        vi.spyOn(gamesService, 'getLatestGameId').mockResolvedValue('latest-game-id');
        vi.spyOn(gamesService, 'calculateGamePaymentStatus').mockResolvedValue({
            gameId: 'latest-game-id',
            gameDate: '2026-03-01',
            feeCents: 1000,
            playerStatuses: [
                { playerId: 'p1', displayName: 'Paid', chargeCents: 1000, paidCents: 1000, status: 'paid' },
                { playerId: 'p2', displayName: 'Unpaid', chargeCents: 1000, paidCents: 0, status: 'unpaid' },
                { playerId: 'p3', displayName: 'Partial', chargeCents: 1000, paidCents: 500, status: 'partial' },
            ],
            summary: { totalExpectedCents: 3000, totalPaidCents: 1500, paidCount: 1, partialCount: 1, unpaidCount: 1 }
        });

        const result = await handler({}, {});
        
        expect(result.gameDate).toBe('2026-03-01');
        expect(result.data).toHaveLength(2);
        expect(result.data.map((p: any) => p.playerId)).toContain('p2');
        expect(result.data.map((p: any) => p.playerId)).toContain('p3');
        expect(result.data.map((p: any) => p.playerId)).not.toContain('p1');
    });

    it('returns empty list if no latest game found', async () => {
        const handler = app.get.mock.calls.find((call: any) => call[0] === '/api/games/latest/unpaid')[1];
        
        vi.spyOn(gamesService, 'getLatestGameId').mockResolvedValue(null);

        const result = await handler({}, {});
        
        expect(result.data).toEqual([]);
    });
});
