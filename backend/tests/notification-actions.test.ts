/**
 * The notification list's own actions: reading and deleting are the user's alone, and the answers never say whether somebody
 * else's notification exists. The delete "✕" on the page used to only hide the row until the next load, because there was no
 * way to delete on the server.
 */
const mockPrisma: any = {
  notification: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockPrisma }));

import notificationService from '../src/services/notification.service';

beforeEach(() => jest.clearAllMocks());

describe('deleting a notification', () => {
  it('removes the signed-in user’s own', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });
    await expect(notificationService.deleteNotification('n1', 'u1')).resolves.toBeUndefined();
    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: 'n1', userId: 'u1' } });
  });

  it('is a 404 for somebody else’s, exactly as for one that does not exist', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    await expect(notificationService.deleteNotification('n-of-someone-else', 'u1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });
    // The id alone is never enough: the user is part of the same delete, so nothing of anyone else's can go.
    expect(mockPrisma.notification.deleteMany.mock.calls[0][0].where).toEqual({ id: 'n-of-someone-else', userId: 'u1' });
  });
});

describe('marking notifications read', () => {
  it('stamps when one was read, and keeps the first time if it is read again', async () => {
    const first = new Date('2026-10-10T08:00:00Z');
    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1', readAt: first });
    await notificationService.markAsRead('n1', 'u1');
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { isRead: true, readAt: first } });

    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'n2', userId: 'u1', readAt: null });
    await notificationService.markAsRead('n2', 'u1');
    const data = mockPrisma.notification.update.mock.calls[1][0].data;
    expect(data.isRead).toBe(true);
    expect(data.readAt).toBeInstanceOf(Date);
  });

  it('refuses somebody else’s notification', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'n3', userId: 'u2', readAt: null });
    await expect(notificationService.markAsRead('n3', 'u1')).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it('stamps all the unread ones at once', async () => {
    await notificationService.markAllAsRead('u1');
    const arg = mockPrisma.notification.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1', isRead: false });
    expect(arg.data.isRead).toBe(true);
    expect(arg.data.readAt).toBeInstanceOf(Date);
  });
});
