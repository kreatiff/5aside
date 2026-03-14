
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { playerRoutes } from './players.js';

// Mocking dependencies
vi.mock('../db/helpers.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((cb) => cb({
    query: vi.fn(),
    release: vi.fn()
  })),
}));

vi.mock('../services/ledger.js', () => ({
  insertLedgerEntry: vi.fn(),
}));

vi.mock('../services/ledger-rules.js', () => ({
  applyRetroactiveSplit: vi.fn(),
}));

vi.mock('../services/balance-recalc.js', () => ({
  recalculateAllBalances: vi.fn(),
}));

vi.mock('../services/bank-import.js', () => ({
  rescanPendingTransactionsForPlayer: vi.fn(),
}));

vi.mock('../utils/request.js', () => ({
  parseUuidParam: vi.fn((req, reply, name) => req.params[name]),
  parseBody: vi.fn((reply, schema, body) => body),
}));

describe('Undo Manual Payment', () => {
    let app: any;
    let mockClient: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn()
        };
        
        const { withTransaction } = await import('../db/helpers.js');
        (withTransaction as any).mockImplementation(async (cb: any) => cb(mockClient));

        app = {
            addHook: vi.fn(),
            requireAuth: vi.fn(),
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
            httpErrors: {
                forbidden: (msg: string) => new Error(msg)
            }
        };

        await playerRoutes(app);
    });

    it('should succeed if adjustment_reason contains "manual" (case insensitive)', async () => {
        const deleteHandler = app.delete.mock.calls.find((call: any) => call[0] === '/api/players/:id/manual-payment/:entryId')[1];
        
        mockClient.query
            .mockResolvedValueOnce({
                rowCount: 1,
                rows: [{ amount_cents: -1000, game_id: null, created_at: '2024-01-01', adjustment_reason: 'Manual adjustment' }]
            })
            .mockResolvedValueOnce({ rowCount: 1 }) // delete query
            .mockResolvedValueOnce({ rows: [{ cutoff_date: '2023-01-01' }] }); // settings query

        const reply = {};
        const request = {
            params: { id: 'player-uuid', entryId: 'entry-uuid' }
        };

        const result = await deleteHandler(request, reply);
        expect(result).toEqual({ deleted: true });
    });

    it('should fail if adjustment_reason is totally unrelated', async () => {
        const deleteHandler = app.delete.mock.calls.find((call: any) => call[0] === '/api/players/:id/manual-payment/:entryId')[1];
        
        mockClient.query.mockResolvedValueOnce({
            rowCount: 1,
            rows: [{ amount_cents: -1000, game_id: null, created_at: '2024-01-01', adjustment_reason: 'Unrelated reason' }]
        });

        const reply = {
            forbidden: vi.fn((msg) => { throw new Error(msg); })
        };

        const request = {
            params: { id: 'player-uuid', entryId: 'entry-uuid' }
        };

        await expect(deleteHandler(request, reply)).rejects.toThrow('Entry is not a manual cash payment (Reason: Unrelated reason)');
        expect(reply.forbidden).toHaveBeenCalledWith('Entry is not a manual cash payment (Reason: Unrelated reason)');
    });

    it('should succeed if adjustment_reason matches "Cash payment"', async () => {
        const deleteHandler = app.delete.mock.calls.find((call: any) => call[0] === '/api/players/:id/manual-payment/:entryId')[1];
        
        mockClient.query
            .mockResolvedValueOnce({
                rowCount: 1,
                rows: [{ amount_cents: -1000, game_id: null, created_at: '2024-01-01', adjustment_reason: 'Cash payment' }]
            })
            .mockResolvedValueOnce({ rowCount: 1 }) // delete query
            .mockResolvedValueOnce({ rows: [{ cutoff_date: '2023-01-01' }] }); // settings query

        const reply = {};
        const request = {
            params: { id: 'player-uuid', entryId: 'entry-uuid' }
        };

        const result = await deleteHandler(request, reply);
        expect(result).toEqual({ deleted: true });
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ledger_entries'), ['entry-uuid']);
    });
});
