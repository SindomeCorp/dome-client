# Output rendering performance

The terminal stores one chronological, in-memory history and mounts only rows
near each output window's viewport. Splits reference the same records rather than
cloning hidden messages. This bounds displayed content, not total retained text.

## Reproduce the measurements

Build assets and install the test browsers:

```bash
npm run build
npx playwright install chromium firefox
npm run test:browser
npm run test:output-performance
```

Performance replays use a local fixture server and synthetic output containing
ANSI formatting, wrapping, media URLs, marked blocks, and 70% matching chat lines.
They exercise receipt, a jump into old history, Find, resizing, closing a split,
export preparation, input, and clearing. No real game connection is made.

The default replay sizes are 20,000, 100,000, and 1,000,000 logical lines. You can
change them and optionally provide a local exported log:

```bash
npm run test:output-performance -- --sizes=20000,100000 --log=/absolute/path/session.html --output=/tmp/output-performance.json
```

If your browser cache directory is not writable, set `PLAYWRIGHT_BROWSERS_PATH`
to a writable directory for both installation and test commands.

The report contains machine/browser versions, timings, mounted row counts,
JavaScript heap usage after forced collection, DOM node counts, and long-task
and heartbeat observations. It contains no message text from a supplied log.
Supplied logs are read locally and are not checked into test fixtures.

## Reference run: 2026-11-12

Reference machine: Linux, AMD Ryzen 5 5600G, 12 logical CPUs, about 14.5 GiB RAM;
Chromium 158.0.8127.18, Node 26.12.1, headless browser at 1280 × 800.

| Retained lines | Mounted rows, split open | JavaScript heap, split open | Find | Close split | Export preparation |
| --- | --- | --- | --- | --- | --- |
| 20,000 synthetic | 132 | 8.0 MiB | 14 ms | 6 ms | 43 ms |
| 100,000 synthetic | 133 | 29.4 MiB | 31 ms | 15 ms | 177 ms |
| 1,000,000 synthetic | 132 | 271.3 MiB | 290 ms | 173 ms | 1,579 ms |
| 19,806 sample-log lines | 110 | 14.5 MiB | 14 ms | 6 ms | 215 ms |

Closing and exporting are chunked operations; their total duration is not a
single main-thread task. No long tasks were reported during this run, but the
timer heartbeat reached about 194 ms in the million-line run, including explicit
memory-measurement/collection work. This is a measured reference, not a guarantee
for every browser, device, font, or message.

After Clear Buffer and forced collection, JavaScript heap usage returned to
approximately 2.7–2.8 MiB in these runs. Browser process, decoded image, GPU, and
other native allocations are not included in JavaScript heap figures.

The sample log is not a synthetic timing baseline: it enters through a
preformatted-record fixture to preserve its richer span formatting. Its loading
time includes fixture transfer and batching and should not be compared directly
with synthetic socket parsing.

### Routing and Find regression replay

After the scrollback/routing/Find fixes, a replay on the same reference machine
also measured a common-term search (`e`) and a search starting at the final row:

| Retained lines | Mounted rows | Matches for `e` | Search index | Common-term Find | Tail rows visited |
| --- | --- | --- | --- | --- | --- |
| 20,000 | 132 | 124,908 | 0.31 MiB | 10 ms | 1 |
| 100,000 | 133 | 624,468 | 1.53 MiB | 31 ms | 1 |
| 1,000,000 | 132 | 6,244,580 | 15.27 MiB | 422 ms | 1 |

At one million lines, the tail search took about 4 ms, split closing took 114 ms
in yielded chunks, and export preparation took 1,513 ms. No long tasks were
reported. The heartbeat reached 273 ms including forced collection for memory
measurements. After clearing and collection, the heap returned to about 2.9 MiB.
The index figures are typed-array storage, not total browser heap usage.

The selection-rendering replay also scrolls from the middle of the larger pane
to its oldest row while text remains selected. At 20,000, 100,000, and 1,000,000
retained lines, that pane kept 77 rows mounted, including the selected endpoint;
the new viewport rendered in about 24–35 ms including two animation frames.
At one million lines, the ordinary split view mounted 138 rows, closing took
142 ms in yielded chunks, and export preparation took 1,499 ms. No long tasks
were reported, and clearing returned collected heap usage to about 2.9 MiB.

### Pruning, clipboard, and saved-media regression replay

After fixing block pruning, standalone media controls, and clipboard permission
handling, the million-line replay mounted 138 rows and retained about 271.4 MiB
of JavaScript heap. Closing the split took 139 ms in yielded chunks; preparing
the log took 1,523 ms, with no reported long tasks. Clearing returned collected
heap usage to about 3.0 MiB.

A 100,000-line run overlapping coverage work recorded two receipt tasks of
57–62 ms. Repeating that size alone recorded no long tasks: closing took 13 ms
and export preparation took 163 ms. An actual 100,000-line download while
closing a split and receiving more output kept every original line once, in
order, and excluded output arriving after its snapshot boundary.

Browser regression tests now exercise real Copy and Paste across unmounted
history, including Chromium with asynchronous clipboard-write permission denied.
Selection preparation is cancellable and discards its cached text on clear or
split closure. Saved-log preview tests open the exported document independently,
verify that media starts unloaded, and expand and collapse the controls.

## Acceptance checks and limitations

- Mounted rows should depend on viewport and overscan rather than retained line
  count. An individual unusually large line can still contain many elements.
- Newly received output must not scan old messages. Regex tests run in a worker,
  and history processing yields between short chunks.
- Live Find snapshots start directly at the first unsearched row. A common-term
  search stores 16 bytes per matching line in typed pages, with at most two
  partially used pages, rather than an object per occurrence. Navigation resolves
  offsets on demand; replacing a query releases the previous index first.
- Routing promises reference sequence IDs rather than retaining message arrays.
  Pruning drops obsolete queued jobs, and the runner caps pending input at 8,192
  lines even with unlimited history. Overflow resolves safely to main. Regression
  checks include a stalled worker, 50,000 incoming lines, and a 10-line limit,
  including collection of pruned records while the worker remains unresolved.
- Keep input, scrolling, and divider controls responsive during receipt, search,
  merging, and export preparation. Target processing chunks below 50 ms.
- Verify variable-height anchoring, offscreen matches, copying native selections across history,
  global pruning, and releasing media and indexes after clearing.
- Scrolling with native text selected must continue mounting viewport rows. Only
  the selected endpoints remain pinned outside that range; copying resolves
  intervening text from history in chunks. Pane padding is excluded from the
  text viewport so final lines remain visible in every split orientation.
- A bounded-history regression checks that short retained lines cannot pin the
  backing string of a large received burst. Input is copied in small chunks while
  preserving complete Unicode characters and CRLF boundaries.
- Observe final clipboard-string and download allocations separately. Export
  preparation timings do not include writing a downloaded file or the native
  application's final full-string allocation.
  A separate million-line browser download produced an approximately 81 MB HTML
  file: the final Blob allocation took about 200 ms and produced a 204 ms main
  thread task. This accepted allocation pause remains outside chunked preparation.
- Unlimited history still consumes memory as retained text grows. Browser storage
  and reload recovery are outside this version.

Run `npm run coverage` on the supported Node 22 runtime. The installed c8/yargs
combination may fail to start on Node 26; browser performance replays themselves
can run there.

See [the user and operator guide](OUTPUT-WINDOWS.md) and
[Testing](TESTING.md) for functional checks.
