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

  Packs      A Pack is a folder of images and videos on the runtime's
             machine, scanned once, with thumbnails and proxies baked into
             its .difracta/ folder. "packs list" shows the Installation's:
             the Bundled Pack (id "bundled", the clips Difracta ships,
             attached to every Installation, read-only) and the attached
             ones, each ok, preparing n/m, or missing. "packs add <folder>"
             makes a folder a Pack and attaches it (from the runtime's own
             machine only); "packs known" lists the Packs this machine
             knows and "packs attach <pack>" attaches one from anywhere;
             "packs detach", "packs locate <pack> <folder>" for a missing
             one, "packs rescan" after files changed.

  Media      An image or video is an entry of a Pack. A Visual's media
             Parameter holds a Media reference, "<pack>/<entry>" by ids, or
             "" for none; at this shell the Pack's name and the file's path
             inside it work too: edit layer/Wall/param/media
             bundled/beam-scan-loop, or Neon/tunnels/04.mp4. "media list
             [pack]" prints every entry with its reference, path, size,
             length, beats and tags. "media tag <entry> <tag…> [--remove]",
             "media beats <entry> <beats|none> [--first-beat <s>]", "media
             thumbnail <entry> <seconds>" and "media rename <entry> <name>"
             edit an entry's metadata in its Pack's manifest (refused on the
             Bundled Pack); "media replace <from> <to>" swaps a reference
             everywhere it is used. Whether an entry exists and has its file
             is live status: a reference into a Pack the machine lacks reads
             as missing and the Layer waits. An entry with a steady pulse has
             beats, how many it lasts, from which its tempo follows; Video's
             Sync to Tempo plays such a clip at the Tempo it is given and
             chases the beat Cue.
             A Screen Share is a slot a Difracta Desktop (the Sharer) shares
             a screen or window into; a Live Layer's media Parameter takes
             its id or name. "media screen-share [name]" adds one; a share
             starts only from the Sharer's own Desktop. "share list" shows
             each slot's status (idle, live, interrupted), Sharer, screen or
             window and Viewers; "share stop <share>" stops one.

  Order      A create lands first in its Group (a Layer: on top; a Screen
             Share: last). Pass "after": <sibling id|name> to place it below
             that sibling, or null for first; entity.move, layer.move and the
             others rearrange. A Layer's "parentId" is a Group, or, for a
             Filter Layer, a Visual Layer: nested there, the Filter treats
             only that Layer's picture on its Target; at the root or in a
             Group it treats the whole frame below it. layer.move takes a
             Filter Layer in and out; scene <scene> shows the nesting.

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

  Masks      A Mask is a polygon of a Surface, in Surface Space, that opens
             (include) or closes (exclude) part of it on every Output; run
             mask.create '{"surfaceId":"Wall","name":"Door"}', then
             mask.update (mode, feather) and mask.point.set / .nudge / .add
             / .remove. An Output Mask is the same polygon in one Output's
             Projection Frame, cutting everything that Output draws to
             black, for a window or a reflector in one projector's beam:
             output-mask.create '{"outputId":"Projector","name":"Window"}'
             starts as an exclude rectangle in the middle of the frame;
             output-mask.update, .rename, .remove and .point.* follow the
             Mask ones with "outputMaskId". entity.move reorders both.

  Addresses  layer/<id|name>/enabled | opacity | blend (Visual Layers)
             layer/<id|name>/mix (Filter Layers)
             layer/<id|name>/param/<key>      layer/<id|name>/cue/<key>
             controller/<id|name>/value       macro/<id|name>/run
             scene/<id|name>/play             surface/<id|name>/render-scale
             installation/blackout            ("addresses" lists them all)
             A Controller is of kind number (0 to 1), color or text.

  Values     true/false, numbers, choice values as text, colours as
             [r,g,b,a] with each component from 0 to 1.

  Text       A text Parameter and a Text Controller hold text, at most
             ${String(settings.text.maxLength)} characters. set and edit take it as typed, so 42 and
             true stay text: edit layer/Sign/param/text 'Boa noite'. A JSON
             string carries line breaks:
             set controller/Words/value '"Line one\\nLine two"'
             A Parameter that catalog <id> shows as "a single line" refuses
             them; "" empties it. In run payloads text is a JSON string.
             run controller.create '{"kind":"text","name":"Words"}' adds a
             Text Controller, and link Words layer/Sign/param/text has the
             Layer show its text (line breaks become spaces on a single
             line). Over OSC it is a string. A Font Parameter is a choice
             among the Bundled Fonts, which catalog lists with their ids.

  Layer      run layer.create '{"kind":"visual","sceneId":"Live","name":"Wash"}'
  recipe     run layer.visual '{"layerId":"Wash","visual":"solid-color",
                 "parameters":{"color":[1,0.5,0,1]}}'  (the rest: defaults)
             run layer.update '{"layerId":"Wash","target":"Wall"}'
             edit layer/Wash/param/color '[1,0.5,0,1]'
             run layer.create '{"kind":"filter","sceneId":"Live",
                 "parentId":"Wash","name":"Warm"}'  (treats Wash alone)
             run layer.filter '{"layerId":"Warm","filter":"colorize"}'
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
