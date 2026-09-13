import { settings } from "@difracta/core";

/**
 * The guide printed after the command list: enough for an agent at a shell
 * to connect, read the Installation, change it and know what came back.
 */
export const SHELL_GUIDE = `
Working from a shell

  Connect    The runtime serves its live socket at ws://<host>:${String(settings.runtime.port)}${settings.runtime.livePath}.
             --url takes that, http://<host>:${String(settings.runtime.port)} or <host>:${String(settings.runtime.port)};
             DIFRACTA_URL sets the default. DIFRACTA_ACTOR names the owner of
             this shell's undo history (default: user@host).

  Read       health, outputs, scenes, scene <Scene>, controllers, macros,
             get [path], addresses, catalog [id], commands, describe <command>.

  Write      run <command> [json]  any command; ids come back in "created".
             edit <Address> <value>  authoring change, undoable.
             set <Address> <value>   show control, never undone.
             trigger <Address...>    Cues, a Scene's play, a Macro's run.
             link, unlink, undo, redo.

  Names      Wherever an Address or a payload field takes an entity id, its
             name works too: layer/Wash/opacity, '{"sceneId":"Live"}'. Names
             match ignoring case and must be unique in their table; an id
             always wins over a name. Replies and listings carry ids.

  Addresses  layer/<id|name>/enabled | opacity | blend (Visual Layers)
             layer/<id|name>/mix (Filter Layers)
             layer/<id|name>/param/<key>      layer/<id|name>/cue/<key>
             controller/<id|name>/value       macro/<id|name>/run
             scene/<id|name>/play             surface/<id|name>/render-scale
             installation/blackout            ("addresses" lists them all)

  Values     true/false, numbers, choice values as text, colours as
             [r,g,b,a] with each component from 0 to 1.

  Layer      run layer.create '{"kind":"visual","sceneId":"Live","name":"Wash"}'
  recipe     run layer.visual '{"layerId":"Wash","visual":"solid-color"}'
             run layer.update '{"layerId":"Wash","target":"Wall"}'
             edit layer/Wash/param/color '[1,0.5,0,1]'
             (catalog <id> lists a Visual's Parameters and Cues.)

  --json     Every command prints one JSON value; a create's reply has
             created: [{table, id}]. Errors are one JSON object on stderr,
             {"error", "issues"?}, with exit code 1.
`;
