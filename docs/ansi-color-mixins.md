# ANSI Color Mixins

`less/client/output-buffer.less` generates ANSI font and color rules through mixins.

- `.ansi-font(@family)` sets a monospace font on the buffer and applies it to all ANSI classes.
- `.ansi-colors(@fg, @bg)` produces foreground and background styles for a colorset.
  - Foreground and background variables contain entries of the form `".selectors" color [font-weight]`.
  - Add a colorset by defining `@colorset-name-fg` and `@colorset-name-bg`, then invoking `.ansi-colors(@colorset-name-fg, @colorset-name-bg)` within the colorset block.

This pattern keeps CSS output consistent and streamlines future color additions.
