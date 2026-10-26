import { boundedJson } from '@/lib/server/json';
import { listRecords, saveRecord, updateRecords } from '@/lib/server/load-desk-store';
import { badRequest, memberRoute } from '@/lib/server/member-route';
import { parseNewRecord, parseRecordEdits } from '@/lib/load-desk/record-input';
import type { WorkspaceUser } from '@/lib/server/auth';

/** Who made a change, as a duplicate review's history names them. */
const actorOf = (member: WorkspaceUser) => member.email ?? member.name ?? member.id;

/** Every saved ticket in the workspace, newest first. */
export function GET(request: Request) {
  return memberRoute(request, async (client, member) =>
    Response.json({ records: await listRecords(client, member.workspaceId) }),
  );
}

/** Saves one ticket; the response carries the stored record with its id. */
export function POST(request: Request) {
  return memberRoute(
    request,
    async (client, member) => {
      let body: Record<string, unknown>;
      try {
        // OCR text for a multi-page scan can be large.
        body = await boundedJson(request, 600_000);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : 'Invalid request.');
      }
      const parsed = parseNewRecord(body.record);
      if ('error' in parsed) return badRequest(parsed.error);
      const record = await saveRecord(client, member.workspaceId, parsed.value, actorOf(member));
      return Response.json({ record }, { status: 201 });
    },
    { write: true },
  );
}

/**
 * Saves changes to saved tickets, all together (for example every ticket on an
 * invoice whose details changed). The response carries the updated records.
 */
export function PATCH(request: Request) {
  return memberRoute(
    request,
    async (client, member) => {
      let body: Record<string, unknown>;
      try {
        // Each ticket carries its OCR text; an invoice can have many tickets.
        body = await boundedJson(request, 4_000_000);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : 'Invalid request.');
      }
      const parsed = parseRecordEdits(body.edits);
      if ('error' in parsed) return badRequest(parsed.error);
      return Response.json({
        records: await updateRecords(client, member.workspaceId, parsed.value, actorOf(member)),
      });
    },
    { write: true },
  );
}
