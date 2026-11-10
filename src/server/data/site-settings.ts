/** 站点开关：注册是否开放、注册是否需要邀请码。存在键值表里，加开关不用改表结构。 */
import { inArray } from 'drizzle-orm';
import type { SiteSettingsData } from '@shared/types';
import type { Db } from '../db/client';
import { siteSettings } from '../db/schema';

/** 开关在库里的键名。 */
const SITE_SETTING_KEYS = {
  registrationOpen: 'registration_open',
  requireInvite: 'require_invite',
} as const;

/** 表里没有数据时的默认值：开放注册、无需邀请码。 */
const DEFAULT_SITE_SETTINGS: SiteSettingsData = {
  registrationOpen: true,
  requireInvite: false,
};

function toBool(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) return fallback;
  return value === '1' || value === 'true';
}

/** 读全部开关。表里没数据时退回默认值。 */
export async function readSiteSettings(db: Db): Promise<SiteSettingsData> {
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(inArray(siteSettings.key, [SITE_SETTING_KEYS.registrationOpen, SITE_SETTING_KEYS.requireInvite]));

  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    registrationOpen: toBool(map.get(SITE_SETTING_KEYS.registrationOpen), DEFAULT_SITE_SETTINGS.registrationOpen),
    requireInvite: toBool(map.get(SITE_SETTING_KEYS.requireInvite), DEFAULT_SITE_SETTINGS.requireInvite),
  };
}

/** 写开关。只写传进来的字段，没传的保持原样。 */
export async function writeSiteSettings(db: Db, patch: Partial<SiteSettingsData>): Promise<SiteSettingsData> {
  const now = Date.now();
  const entries: [string, boolean][] = [];
  if (patch.registrationOpen !== undefined) entries.push([SITE_SETTING_KEYS.registrationOpen, patch.registrationOpen]);
  if (patch.requireInvite !== undefined) entries.push([SITE_SETTING_KEYS.requireInvite, patch.requireInvite]);

  for (const [key, value] of entries) {
    const row = { value: value ? '1' : '0', updatedAt: now };
    await db
      .insert(siteSettings)
      .values({ key, ...row })
      .onConflictDoUpdate({ target: siteSettings.key, set: row });
  }
  return readSiteSettings(db);
}
