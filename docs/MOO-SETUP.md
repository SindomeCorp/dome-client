# MOO Setup

This document tracks what must exist on the MOO side for the web client to function fully. In many cases, a stock ToastCore or LambdaCore db will have these verbs. If changes are required, they will be called out.

## Enabling Local Editing

Run:

```moo
@edit-options +local
```

### Scratch Pad Property Requirement

To support saving scratch pad content for users who can invoke the IDE editor, define a `scratch` property on an appropriate descendant object:

```moo
@prop <obj>.scratch {}
```

### Optional `@scratch` Wrapper Verb

This is not required, but is a useful wrapper for scratch saving from the IDE.

Create the verb:

```moo
@verb <programmer obj>:@scratch any any any rxd
```

Then program it with:

```moo
@program <programmer obj>:@scratch
```

Verb body:

```moo
"For use by clients' local editors, to save new text for a scratch pad.  See $note_editor:local_editing_info() for details.";
set_task_perms(player);
text = $command_utils:read_lines();
if (value_bytes(text) > 10000)
  return player:notify("Scratch not saved! Too large to store. If you think this limit should be increased, talk to a wizard.");
endif
this.scratch = text;
this:notify("Your .scratch property has been updated with the contents of your scratch pad. Any time you save your scratch it overwrites what was there previously. You can view/edit it with @edit me.scratch");
```

## 5) Optional UX Message Hook

### `@@editor-message <message>`
- Why: Client uses it for duplicate-tab feedback routed through MOO output.
- Needed on MOO:
  - Optional support for displaying/echoing editor status messages.

## Verb Management System (VMS) Notes

VMS notes are controlled by:

```env
IDE_VMS_NOTE_ENABLED=false
```

When `IDE_VMS_NOTE_ENABLED=true`:
- Program editor saves can prompt for a VMS note if one is not already present.
- The IDE may show a VMS note input associated with `@program` tabs.
- After sending the normal save payload (`@program ...` followed by buffer and `.`), the client sends an additional line containing the VMS note.

That extra line is effectively a commit-style message for the program save. If you enable this feature, your MOO-side `@program` flow should be modified to expect a possible extra post-program line and process/store it appropriately.

When `IDE_VMS_NOTE_ENABLED=false`:
- No VMS prompt is shown.
- No VMS text input is shown.
- No extra VMS line is sent.

## `@edit <obj>:verb --open-parent`

When IDE ctrl/cmd-click navigation is used on an `obj:verb` reference, the client can send:

```moo
@edit <obj>:<verb> --open-parent
```

This behavior is controlled by:

```env
IDE_EDIT_OPEN_PARENT=false
```

When `IDE_EDIT_OPEN_PARENT=true` and your `@edit` implementation supports `--open-parent`, you can pass the argument into `#49:parse_invoke` (Verb Editor) so resolution checks not only the object itself but also its parent chain (similar to `@list` behavior).

Result:
- Ctrl/cmd-click navigation from the IDE becomes much cleaner for inherited verbs.
- Developers can jump to verb definitions without manually hunting through parent objects.

## `@edit <objectId>.<propertyName>`

The IDE uses property targets in this form when opening properties for editing:

```moo
@edit <objectId>.<propertyName>
```

For ToastCore-based setups, this should generally work by default with existing `@edit` behavior.

Needed on MOO:
- `@edit` must accept object/property targets using dot notation.
- Property edit responses should return content in the normal editor-open flow expected by the web client.

## Sindome Web Client Commands (SDWC)

SDWC is the out-of-band (OOB) command channel used by the IDE to communicate with the MOO without interrupting the normal flow of player-entered commands. This lets the web client and MOO exchange IDE/browser metadata and responses asynchronously while regular gameplay command handling continues normally.

For dedicated documentation of SDWC nowrap markers (`SDWC-START-NOWRAP` / `SDWC-END-NOWRAP`), see [SDWC OOB NOWRAP Markers](SDWC-OOB.md).

To support SDWC, several verbs may need to be added or modified.

### 1) Modify `#0:do_out_of_band_command`

This should be modified (or your local equivalent adapted) to dispatch SDWC payloads:

```moo
"do_out_of_band_command -- a cheap and very dirty do_out_of_band verb.  Forwards to verb on player with same name if it exists, otherwise forwards to $login.  May only be called by the server in response to an out of band command, otherwise E_PERM is returned.";
if (((caller == #-1) && (caller_perms() == #-1)) && (callers() == {}))
  if (valid(player) && is_player(player))
    if (player.programmer && `argstr[5..8] ! ANY => ""' == "SDWC")
      player:parse_sdwc_command(argstr[9..$]);
    else
      $mcp:(verb)(@args);
      set_task_perms(player);
      $object_utils:has_callable_verb(player, "do_out_of_band_command") && player:do_out_of_band_command(@args);
    endif
  elseif ($telnet:(verb)(@args))
    return;
  else
    $login:do_out_of_band_command(@args);
  endif
else
  return E_PERM;
endif
```

### 2) Add `<programmer parent>:parse_sdwc_command`

Create the verb:

```moo
@verb <programmer parent>:parse_sdwc_command tnt rxd
```

Then program it with:

```moo
@program <programmer parent>:parse_sdwc_command
```

Verb body:

```moo
":parse_sdwc_command(STR command) => NONE";
"parse an SD web client command";
{message} = args;
"%%command%%";
parts = $string_utils:explode(message, "%%");
if (parts[1] == "verbs")
  {command, object} = parts;
  "%%verbs%%object%%";
  object = toobj(object);
  json = $code_utils:get_verbs_json(object);
  notify(player, tostr("#$# SDWC%%VERBS%%", json));
elseif (parts[1] == "props")
  {command, object} = parts;
  "%%props%%object%%";
  object = toobj(object);
  json = $code_utils:get_props_json(object);
  notify(player, tostr("#$# SDWC%%PROPS%%", json));
elseif (parts[1] == "PROP-OVERLAY")
  {command, object, property} = parts;
  if (length(object) <= 1)
    raise(E_ARGS, "failed to do verb-overlay due to incorrect object");
    return;
  endif
  object_to_use = toobj(object);
  try
    if (`object[1] == "$" ! E_RANGE => 0')
      "cored object";
      if ($object_utils:has_property(#0, object[2..$]))
        object_to_use = $sysobj.(object[2..$]);
      else
        raise(E_ARGS, "failed to do verb-overlay due to invalid cored object");
        return;
      endif
    endif
    if (!$object_utils:has_property(object_to_use, property))
      prop_data = "Prop not found";
    else
      if (`property[1..4] == "SQL_" ! ANY => 0')
        "special handling for SQL props, render as a list and don't trunc";
        prop_data = object_to_use.(property);
      else
        prop_data = toliteral(object_to_use.(property));
        "trim it to 500 characters";
        if (length(prop_data) > 500)
          prop_data = tostr(prop_data[1..500], " (truncated)");
        endif
      endif
    endif
    notify(player, tostr("#$# SDWC%%PROP-OVERLAY%%", generate_json(["object" -> object, "property" -> property, "value" -> prop_data])));
  except e (ANY)
    raise(e);
  endtry
elseif (parts[1] == "VERB-OVERLAY")
  {command, object, verbname} = parts;
  if (length(object) <= 1)
    raise(E_ARGS, "failed to do verb-overlay due to incorrect object");
    return;
  endif
  try
    if (`object[1] == "$" ! E_RANGE => 0')
      "cored object";
      if ($object_utils:has_property(#0, object[2..$]))
        cored_object = $sysobj.(object[2..$]);
      else
        raise(E_ARGS, "failed to do verb-overlay due to invalid cored object");
        return;
      endif
      {resolved_object, verbname, verb_headers} = $code_utils:get_verb_header(cored_object, verbname);
    else
      "regular obj#";
      object = toobj(object);
      {resolved_object, verbname, verb_headers} = $code_utils:get_verb_header(object, verbname);
    endif
    if (!verb_headers)
      "we don't have any headers";
      verb_headers = "Verb has no top comments or args definition. Consider adding one!";
    endif
    notify(player, tostr("#$# SDWC%%VERB-OVERLAY%%", generate_json(["object" -> object, "resolved_object" -> resolved_object, "verb" -> verbname, "value" -> verb_headers])));
  except e (ANY)
    raise(e);
  endtry
endif
```

### 3) Add `$code_utils:get_verbs_json`

Create the verb:

```moo
@verb $code_utils:get_verbs_json tnt rxd
```

Then program it with:

```moo
@program $code_utils:get_verbs_json
```

Verb body:

```moo
":display_verbs_json(OBJ object) => STR";
"get info about verbs and return it in json";
{object} = args;
set_task_perms(caller_perms());
data = ["object" -> object, "owner" -> object.owner, "name" -> object.name];
verb_count = 1;
verbs = [];
while (typeof(info = `verb_info(object, verb_count) ! ANY') != ERR)
  verbs[verb_count] = ["owner" -> info[1], "permissions" -> info[2], "name" -> info[3], "args" -> verb_args(object, verb_count), "last updated" -> "UNKNOWN - EDIT $code_utils:get_verbs_json if you track this somehow"];
  verb_count = verb_count + 1;
  if (verb_count > 500)
    raise(E_ARGS, "aborting verb count > 500");
    return;
  endif
endwhile
data["verbs"] = verbs;
return generate_json(data);
```

### 4) Add `$code_utils:get_props_json`

Create the verb:

```moo
@verb $code_utils:get_props_json tnt rxd
```

Then program it with:

```moo
@program $code_utils:get_props_json
```

Verb body:

```moo
":get_props_json(OBJ object) => STR json";
"returns property info (NOT content) on all props of an object, in json";
"";
"you may want to set_task_perms(player) or to wizard or something else";
set_task_perms(player);
{object} = args;
data = ["object" -> object, "name" -> object.name, "parent" -> parent(object), "owner" -> object.owner];
flags = ["player" -> is_player(object) ? true | false, "programmer" -> object.programmer, "wizard" -> object.wizard, "r" -> object.r, "w" -> object.w, "f" -> object.f];
data["flags"] = flags;
props = [];
if (player.programmer && (player.wizard || player == object.owner || object.r))
  all_props = $object_utils:all_properties(object);
  if (all_props != {})
    for p in (all_props)
      $command_utils:suspend_if_needed(0);
      property_info = property_info(object, p);
      props[p] = ["clear" -> is_clear_property(object, p), "owner" -> property_info[1], "permissions" -> property_info[2]];
    endfor
  endif
else
  props = ["error" -> "permission denied"];
endif
data["props"] = props;
return generate_json(data);
```

### 5) Add `$code_utils:get_verb_header`

Create the verb:

```moo
@verb $code_utils:get_verb_header tnt rxd
```

Then program it with:

```moo
@program $code_utils:get_verb_header
```

Verb body:

```moo
":get_verb_header(OBJ object, STR verbname) => LIST";
"get the verb headers (comments) and return them";
{object, verbname} = args;
set_task_perms(#2);
output = {};
verb_count = 1;
verb_location = $object_utils:match_verb(object, verbname);
if (!verb_location)
  return "unable to find verb with that name on object or parents";
endif
"we have a real object and verbname now";
{object, verbname} = verb_location;
info = `verb_info(object, verbname) ! ANY';
if (typeof(info) == ERR)
  return "verb_info returned an error";
endif
verbdocs = $code_utils:verb_documentation(object, verbname);
if (arguments = $code_utils:_grep_verb_code("} = args;", object, verbname))
  verbdocs = {$string_utils:trim(arguments[2]), @verbdocs};
endif
return {object, verbname, verbdocs};
```

## EDITOR ALREADY OPEN VERB

This verb is run when a player uses `@edit` on a verb that is already open in the IDE editor window.

Create the verb:

```moo
@verb <programmer obj>:@@editor-message any any any rxd
```

Then program it with:

```moo
@Program <programmer obj>:@@editor-message
```

Verb body:

```moo
"this verb is intended to be called automatically by the IDE editor in order to provide a message to the MOO that is shown to the player";
player:notify(tostr("[IDE Editor] ", argstr));
```

## SAVING VERBS

With a stock `@program` verb, saving verbs from the IDE window should work automatically.

The IDE save flow sends:
1. `@program <obj>:<verb>`
2. The verb body as multiline input, terminated by a single `.` line

## SAVING PROPERTIES (`@set-note-string` / `@set-note-text`)

These commands already exist in ToastCore/LambdaCore and do not need to be updated. The editor invokes these commands when saving a property edit:

- `@set-note-string <obj>.<prop>` for string-style property editing
- `@set-note-text <obj>.<prop>` for note/text-style property editing

As with other editor saves, the client sends the upload command first, then the multiline content terminated by a single `.` line.

## `@dome-client-user <hostname-or-ip>`

The web client sends this command as part of connection metadata flow (in response to the server marker `#$# dome-client-user`).

If you want to register the actual IP/hostname connecting to your server, you can implement this command and hook it into `$player.all_connect_places` however you want.

## 7) Implementation Checklist

- [ ] Implement `@dome-client-user`
- [ ] Implement/verify `@edit` obj:verb --open-parent` if you want it)
- [ ] Implement `#0:do_out_of_band_commands` + `$code_utils` verbs
- [ ] Implement/verify upload commands and dot-terminated multiline save
- [ ] Verify obj:verb hover behavior
- [ ] Verify obj:verb command/control+click behavior

## Sindome Specific - You can ignore or write your own implementations

These commands are Sindome-specific save paths used by some editor flows:

- `@local-save-node ...`
- `@local-save-node-admin ...`
- `@local-save-note ...`

If your codebase does not use these, you can ignore them. If you need equivalent behavior, implement your own command handlers and return/editor flows that match your local workflow.
