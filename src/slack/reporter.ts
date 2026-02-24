export function isEightAmInTimezone(timezone: string, now: Date = new Date()): boolean {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
      hourCycle: 'h23',
    }).format(now);
    // Intl may return '8', '08', or '24' (for midnight) depending on ICU version; parseInt handles all cases
    return parseInt(formatted, 10) === 8;
  } catch {
    return false;
  }
}

export function formatSlackMessage(
  stats: { totalCost: number; activeUsers: number; blockedEvents: number },
  date: string
): string {
  const spend =
    stats.totalCost > 0 && stats.totalCost < 0.01
      ? '<$0.01'
      : `$${stats.totalCost.toFixed(2)}`;
  return [
    `📊 *Daily Report — ${date}*`,
    '',
    `💰 *Spend today:* ${spend}`,
    `👥 *Active users:* ${stats.activeUsers}`,
    `⚠️ *Blocked events:* ${stats.blockedEvents}`,
    '',
    '_Powered by Tokenist_',
  ].join('\n');
}

async function getOrgDailyStats(
  db: D1Database,
  orgId: string,
  timezone: string,
  now: Date
): Promise<{ totalCost: number; activeUsers: number; blockedEvents: number }> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
  }).format(now);
  const [spendRow, usersRow, blockedRow] = await Promise.all([
    db
      .prepare(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM request_logs WHERE org_id = ? AND date(created_at) = ?`)
      .bind(orgId, today)
      .first<{ total: number }>(),
    db
      .prepare(`SELECT COUNT(DISTINCT end_user_id) as count FROM request_logs WHERE org_id = ? AND date(created_at) = ?`)
      .bind(orgId, today)
      .first<{ count: number }>(),
    db
      .prepare(`SELECT COUNT(*) as count FROM request_logs WHERE org_id = ? AND date(created_at) = ? AND status = 'blocked'`)
      .bind(orgId, today)
      .first<{ count: number }>(),
  ]);
  return {
    totalCost: spendRow?.total ?? 0,
    activeUsers: usersRow?.count ?? 0,
    blockedEvents: blockedRow?.count ?? 0,
  };
}

async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`[slack] Webhook POST failed with status ${res.status}`);
  }
}

export async function handleSlackReports(db: D1Database): Promise<void> {
  const now = new Date();
  const { results } = await db
    .prepare('SELECT * FROM slack_settings WHERE enabled = 1')
    .all<{ org_id: string; webhook_url: string; timezone: string }>();

  const eligible = results.filter((row) => isEightAmInTimezone(row.timezone, now));

  const settled = await Promise.allSettled(
    eligible.map(async (row) => {
      const stats = await getOrgDailyStats(db, row.org_id, row.timezone, now);
      const dateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: row.timezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(now);
      const message = formatSlackMessage(stats, dateStr);
      await postToSlack(row.webhook_url, message);
    })
  );
  for (const result of settled) {
    if (result.status === 'rejected') {
      console.error('[slack] Report delivery failed:', result.reason);
    }
  }
}
