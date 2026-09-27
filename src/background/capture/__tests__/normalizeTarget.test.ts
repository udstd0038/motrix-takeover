import { describe, expect, it } from 'vitest'
import { normalizeTarget } from '@/background/capture/normalizeTarget'

describe('normalizeTarget', () => {
  it('prefers finalUrl for url and referrer for pageUrl', () => {
    const t = normalizeTarget({
      url: 'https://x/start',
      finalUrl: 'https://cdn/file.bin',
      referrer: 'https://page/here',
      tabTitle: 'My Page',
      suggestedFilename: '/downloads/file.bin',
      mime: 'application/octet-stream',
      sizeBytes: 1234,
      origin: 'auto',
    })
    expect(t.url).toBe('https://cdn/file.bin')
    expect(t.pageUrl).toBe('https://page/here')
    expect(t.pageTitle).toBe('My Page')
    expect(t.suggestedFilename).toBe('file.bin')
    expect(t.sizeBytes).toBe(1234)
  })

  it('falls back pageUrl=url and pageTitle=filename when no referrer/tab (no-referrer auto download)', () => {
    const t = normalizeTarget({
      url: 'https://cdn/a/b/report.pdf',
      origin: 'auto',
    })
    expect(t.pageUrl).toBe('https://cdn/a/b/report.pdf')
    expect(t.suggestedFilename).toBe('report.pdf')
    expect(t.pageTitle).toBe('report.pdf')
    expect(t.siteHint).toBe('cdn')
  })

  it('treats non-positive/absent size as null and truncates filename to 255 chars', () => {
    const long = `${'a'.repeat(300)}.zip`
    const t = normalizeTarget({
      url: `https://h/${long}`,
      sizeBytes: 0,
      origin: 'context-menu',
    })
    expect(t.sizeBytes).toBeNull()
    expect(t.suggestedFilename.length).toBe(255)
  })

  it('truncates pageTitle to 500 chars (mdxp source.pageTitle max)', () => {
    const t = normalizeTarget({
      url: 'https://h/f.bin',
      tabTitle: 'x'.repeat(600),
      origin: 'auto',
    })
    expect(t.pageTitle.length).toBe(500)
  })

  it('derives the last real segment for a trailing-slash watch URL (bilibili /video/BVxxx/)', () => {
    // Regression: a trailing slash used to yield '' → a meaningless "(1)"
    // filename once it reached Motrix. The last real segment is the bvid.
    const t = normalizeTarget({
      url: 'https://www.bilibili.com/video/BV14vJg6ZEd4/',
      origin: 'context-menu',
    })
    expect(t.suggestedFilename).toBe('BV14vJg6ZEd4')
  })

  it('ignores the query string on a trailing-slash watch URL', () => {
    const t = normalizeTarget({
      url: 'https://www.bilibili.com/video/BV14vJg6ZEd4/?spm_id_from=333',
      origin: 'context-menu',
    })
    expect(t.suggestedFilename).toBe('BV14vJg6ZEd4')
  })

  it('keeps only the basename of a Firefox Windows absolute-path filename', () => {
    // Regression: Firefox reports DownloadItem.filename as an absolute path
    // (D:\Users\Desktop\file.zip). Forwarding it whole made Motrix sanitize
    // the `:` and `\` into `D__Users_Desktop_file.zip`.
    const t = normalizeTarget({
      url: 'https://cdn.example.com/file.zip',
      suggestedFilename: 'D:\\Users\\Desktop\\file.zip',
      origin: 'auto',
    })
    expect(t.suggestedFilename).toBe('file.zip')
  })

  it('keeps the original (possibly spaced/unicode) name from a Windows path', () => {
    const t = normalizeTarget({
      url: 'https://cdn.example.com/report.pdf',
      suggestedFilename: 'D:\\Users\\Desktop\\季度报告 (1).pdf',
      origin: 'auto',
    })
    expect(t.suggestedFilename).toBe('季度报告 (1).pdf')
  })

  it('handles forward-slash absolute paths (macOS/Linux Firefox) the same way', () => {
    const t = normalizeTarget({
      url: 'https://cdn.example.com/a.bin',
      suggestedFilename: '/home/user/Downloads/a.bin',
      origin: 'auto',
    })
    expect(t.suggestedFilename).toBe('a.bin')
  })
})
