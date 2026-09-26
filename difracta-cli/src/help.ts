import { settings } from "@difracta/core";

/**
 * The guide printed after the command list: enough for an agent at a shell
 * to connect, read the Installation, change it and know what came back.
 */
export const SHELL_GUIDE = `
Working from a shell

  Connect    The runtime serves its live socket at ws://<host>:${String(settings.runtime.port)}${settings.runtime.livePath}.
             --url takes that, http://<host>:${String(settings.runtime.port)} or <host>:${String(settings.runtime.port)};
             DIFRACTA_URL sets the default. "runtimes" lists the ones
             announcing themselves on the local network, each with the
             address:port to pass. DIFRACTA_ACTOR names the owner of this
             shell's undo history (default: user@host).

  Read       health, outputs, scenes, scene <Scene>, controllers, macros,
             osc, get [path|Address], addresses, catalog [id], commands,
             describe <command> (its payload fields; --json for the schema).

  Write      run <command> [json]  any command; "created" names what it made.
             edit <Address> <value>  authoring change, undoable.
             set <Address> <value>   show control, not undoable.
             trigger <Address...>    Cues, a Scene's play, a Macro's run.
             link, unlink, undo, redo.

  Save       Authoring (run, edit, link, undo) changes the open Installation
             in memory; "documents save" writes it, and "health" says
             "unsaved changes" until then. set and trigger are not undoable
             and not part of history, but a value set on a document Address
             (layer/Wash/opacity, a Scene played) is saved with the
             Installation too; Blackout and Cues are performance state and
             never saved.
             "health" also says "documents pinned" or "documents free": a
             pinned runtime keeps its one file and refuses documents new,
             open, close and save <other path>.
             "documents download [path]" writes a copy here, a backup;
             "documents replace <file>" puts a local file's content in its
             place, unsaved until "documents save" ("documents revert" goes
             back). Both work on any runtime, from any machine.

  Displays   "displays list" shows the Display Hosts connected to the runtime
             and their Displays (physical screens); "displays show <host>
             <display> <Output>" puts an Output on one, "displays hide <host>
             <display>" takes it off. Works from any machine.

  Media      Images (png, jpg, jpeg, webp, gif, svg) and videos (mp4, webm,
             mov) are Media items of kind file, stored by a path relative to
             the Installation file's folder; their type, image or video,
             comes from the extension. "media add <file> [--name N]
             [--group G]" adds one from a path on this machine (the
             Installation must be saved; ".." paths are fine, and served
             only with the runtime's --media-anywhere). "media group <name>
             [--group G]" adds a Media Group to arrange them; media.move and
             media.ungroup rearrange. "media list" shows the tree with each
             file's status: ok, missing, outside, unsaved. A Visual's media
             Parameter takes a file's id or name, or "" for none:
             edit layer/Wall/param/media Logo. Names are unique within a
             Group, so a name used in two Groups is ambiguous: give the id.
             The runtime serves a file at GET /media/<id>.
             Bundled Media are clips Difracta ships: "media bundled" lists
             them (id, name, type, loop, hit, recommended), "catalog <id>"
             describes one, "media add --bundled <id|name>" adds one as a
             Media item of kind bundled (no save needed), and
             run media.bundled '{"mediaId":…,"bundled":…}' swaps its clip.

  Order      A create lands first in its Group (a Layer: on top; a Media
             item: last). Pass "after": <sibling id|name> to place it below
             that sibling, or null for first; entity.move, layer.move and the
             others rearrange.

  Names      Wherever an Address or a payload field takes an entity id, its
             name works too: layer/Wash/opacity, '{"sceneId":"Live"}'. Names
             match ignoring case and must be unique in their table; an id
             always wins over a name. Replies and listings carry ids.

  Regions    A Region is a rectangle of a Surface, in Surface Space, that a
             Layer can target instead of the whole Surface; it follows the
             Surface's calibration and Masks. run region.create
             '{"surfaceId":"Wall","name":"North"}' makes one (centered, half
             the Surface); region.corner.set / .nudge move its topLeft or
             bottomRight corner. As a "target", write it Wall/North, or
             North alone when no other Region has that name.

  Addresses  layer/<id|name>/enabled | opacity | blend (Visual Layers)
             layer/<id|name>/mix (Filter Layers)
             layer/<id|name>/param/<key>      layer/<id|name>/cue/<key>
             controller/<id|name>/value       macro/<id|name>/run
             scene/<id|name>/play             surface/<id|name>/render-scale
             installation/blackout            ("addresses" lists them all)

  Values     true/false, numbers, choice values as text, colours as
             [r,g,b,a] with each component from 0 to 1.

  Layer      run layer.create '{"kind":"visual","sceneId":"Live","name":"Wash"}'
  recipe     run layer.visual '{"layerId":"Wash","visual":"solid-color",
                 "parameters":{"color":[1,0.5,0,1]}}'  (the rest: defaults)
             run layer.update '{"layerId":"Wash","target":"Wall"}'
             edit layer/Wash/param/color '[1,0.5,0,1]'
             (catalog <id> lists a Visual's Parameters, their ranges and
             steps, which a value must sit on, and its Cues.)

  Macro      A Macro's Run Mode picks which actions a run performs: all
             (default), one at random, some at random, or the next in
             sequence. Each action may have a chance, 0 to 1, of firing
             once picked; absent means always.
             run macro.mode.set '{"macroId":"Shimmer","mode":"some","count":3}'
             run macro.actions.add '{"macroId":"Shimmer","actions":[{"kind":
                 "trigger","address":"layer/Wall/cue/flash","chance":0.4}]}'
             run macro.action.update '{"macroId":"Shimmer","actionId":"<id>",
                 "chance":0.2}'   (null for always)
             trigger macro/Shimmer/run says how many were picked and fired.

  --json     Every command prints one JSON value; a create's reply has
             created: [{table, id, name}]. Errors are one JSON object on
             stderr, {"error", "issues"?}, with exit code 1.
`;
