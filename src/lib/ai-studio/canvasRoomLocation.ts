export function canvasRoomHref(search: string, roomId?: string): string {
  const params = new URLSearchParams(search);
  if (roomId) params.set('roomId', roomId);
  else params.delete('roomId');
  const query = params.toString();
  return query ? `?${query}` : '?';
}
