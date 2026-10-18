import "server-only";

import { getPacket } from "@/lib/packet/load";

export function getPersonaLabel(personaId: string): string {
  const packet = getPacket();
  const staff = packet.firm.staff.find((s) => s.id === personaId);
  if (staff) {
    return `${staff.name} · ${staff.role}`;
  }
  const client = packet.firm.client_users.find((c) => c.id === personaId);
  if (client) {
    return `${String(client.name ?? personaId)} · client`;
  }
  return personaId;
}
