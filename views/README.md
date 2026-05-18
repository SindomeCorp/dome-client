# View templates

EJS templates in this directory render the HTML sent to clients.

## Directory structure

- `layouts/` – wrappers that provide the `<html>` skeleton. `main.ejs` is the default layout used by Express.
- `partials/` – reusable snippets such as overlays or buttons. File names are lowercase with hyphens.
- `pages/` – full page templates rendered via `res.render()`. In this project they live at the root of `views/` (e.g. `client.ejs`), but you may group them under `pages/` if the list grows.

## Naming

Use **kebab-case** for all file names and keep the `.ejs` extension.

## Escaping

EJS offers two output tags:

- `<%= value %>` escapes HTML (safe for user data).
- `<%- value %>` renders unescaped HTML. Only use it with trusted markup, such as when including partials or sanitized HTML.

## Including modules and partials

Include another template with:

```ejs
<%- include('partials/mini-controls') %>
```

Templates run in Node, so you can require modules if needed:

```ejs
<% const md5 = require('md5'); %>
```

## Passing data

Pass data when rendering:

```js
res.render('client', { meta: { title: 'Client' }, socketUrl })
```

The properties become template variables, e.g. `<%= meta.title %>` or `<%= socketUrl %>`. Shared values can be placed on `res.locals`.

## Static assets

Files in `public/` are served statically. Reference them with absolute paths and the `decache` helper to bust caches:

```ejs
<link rel="stylesheet" href="<%= decache('/css/client.css') %>">
<script type="module" src="<%= decache('/js/player-client.js') %>"></script>
```
