import { describe, expect, it } from 'vitest'
import manifestConfig from '#manifest-config'

// Community fork identity. This ID is NOT in Motrix's built-in official
// allowlist, so Motrix will show the extension as `attested-non-official`
// (NM ticket proves the caller ID, but it is not the official ID). The user
// must add this ID once under Settings → Integration → Browser extensions →
// Trusted extensions in Motrix. The native-messaging manifest must also list
// this exact ID in `allowed_extensions`.
const STORE_SIGNED_GECKO_ID = 'motrix-takeover@local.dev'

describe('manifest identity', () => {
  it('declares the store-signed Gecko ID for Firefox builds', async () => {
    const manifest = (await manifestConfig({
      command: 'build',
      mode: 'firefox',
    })) as Record<string, unknown>
    const settings = manifest.browser_specific_settings as
      | {
          gecko?: {
            id?: string
            data_collection_permissions?: { required?: string[] }
          }
        }
      | undefined
    expect(settings?.gecko?.id).toBe(STORE_SIGNED_GECKO_ID)
    expect(settings?.gecko?.data_collection_permissions?.required).toEqual([
      'authenticationInfo',
      'browsingActivity',
      'websiteContent',
      'websiteActivity',
    ])
  })
})
