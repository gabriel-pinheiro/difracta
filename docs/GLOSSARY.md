# Glossary

Canonical vocabulary for Difracta, revised as the project grows. Terms describe
intended scope; a term may name a concept not yet implemented. Prefer these
terms in code, UI text, docs, and conversation.

## Physical and mapped space

### Installation

One complete projection setup and its configuration.

An Installation owns Outputs, Surfaces, Surface Mappings, Regions, Masks, Paths,
Media, Scenes, Controllers, Parameter Links, and Macros.

### Projector

The physical device that emits light. A Projector is hardware; an Output is the
logical rendering destination feeding it.

Hardware control is not part of the initial engine.

### Output

A logical rendering destination associated with a fullscreen Output browser and
a projector-connected display. An Installation may contain multiple Outputs.

Do not use Output as a synonym for a Surface or Scene.

### Projection Frame

The complete pixel image rendered for one Output at one instant. It ultimately
has the Output display's width and height and contains no unresolved
transparency.

Use `canvas` for the HTML5 `<canvas>` implementation element, not for this
domain concept.

### Surface

A calibrated projection target representing a real-world receiving surface, such
as `Ceiling` or `Plafond`, or several alike that show the same content, such as
`Score` on an LED panel and on the host's return TV.

A Surface belongs to the Installation rather than an Output, and may be on
several Outputs at once, each through a Surface Mapping of its own. Its Regions,
Masks, Paths, Surface Size and Render Scale are the same on all of them. Nothing
keeps the Outputs in step: each renders the Surface's Layers with its own Visual
Instances, so this is for showing one thing in several places, not for blending
projectors into one image. Surface shapes may overlap when mapped into the same
Projection Frame.

### Surface Space

The local coordinate system in which a Surface's Regions, Masks, Paths, and
Visual content are described. Rendering is transformed from Surface Space
through a Surface Mapping into an Output's Projection Frame.

Surface Space is the normalized unit rectangle from `(0, 0)` at its top-left to
`(1, 1)` at its bottom-right.

### Render Scale

A Surface setting (0.25×–2×, default 1×) that multiplies the resolution of the
engine-owned canvases its Canvas 2D Visuals render into. It trades sharpness for
rendering throughput and does not change composition, Surface Space, or Shader
Visuals. It is an Address, so it can be swept from a Control or the CLI.

### Surface Size

A Surface's real width and height in any unit, only the ratio matters. Empty
means automatic: the shape follows the mapping, which is right whenever the
projector faces the Surface. Stated, it keeps Visuals unstretched on a Surface
seen at a steep angle, where the projection alone hides the real shape.

### Region

A named axis-aligned rectangle of a Surface, in Surface Space, that a Layer may
target instead of the whole Surface, such as `North Panel` on the `Wall`. It is
stored as two corners, top-left and bottom-right, stays inside the Surface and
has no rotation or skew. It inherits the Surface's calibration and Masks and
adds no perspective of its own, so recalibrating the Surface moves every Region
with it, which separate Surfaces drawn by eye never do. Regions on one Surface
may overlap; each is cut hard at its edge and they composite by Layer order.
Names are unique among the Regions of one Surface; the CLI writes one as
`Wall/North Panel`.

A Region has no Masks, Paths or Regions of its own: a Layer on it binds the
Paths of its Surface. Use the whole Surface when no subsection is needed, and do
not draw thin Regions to stand for lines; that is a Path.

### Region Space

The normalized unit rectangle a Region presents to the Visual targeting it, from
`(0, 0)` at the Region's top-left corner to `(1, 1)` at its bottom-right. A
Visual on a Region renders into a canvas sized to the Region's projected pixels,
with the Surface's stated Size scaled to the rectangle, so it is exactly as
sharp and as cheap as its part of the Surface. Paths reach the Visual in Region
Space. Aspect is otherwise uncorrected: a tall narrow Region squashes a circle
exactly as a wide Surface already does.

### Mask

A named polygon in Surface Space that decides which parts of its owning Surface
receive projection, such as the real trapezoidal shape of a wall or an outlet on
it.

A Mask belongs to a Surface, not to a Surface Mapping: it records a physical
fact about the receiving surface and therefore applies on every Output the
Surface is on. It is `include`, meaning only its area is lit, or `exclude`,
meaning its area is never lit, and it has 3–16 points forming a closed polygon
plus its own feather amount. Masks of one Surface are ordered and named uniquely
within that Surface.

A Surface with no Include Masks is fully lit; one with any Include Mask starts
fully closed. Masks then apply in array order, each opening or closing only its
own polygon. Masked-out pixels are transparent rather than black, so a hole
reveals whatever another Surface draws underneath it.

Feather is a fraction of Surface Space and fades inward only, so a feathered
Mask lights strictly less than a hard one and never spills past the physical
edge it exists to respect.

A clipping mask owned by a Surface Mapping, for blocking one projector's spill
or working around an obstruction in one beam, remains a separate deferred
concept.

### Surface Mapping

The calibration of one Surface for one Output: the ordered four-corner
quadrilateral, in normalized Projection Frame coordinates, where Surface Space
lands. Corners may extend past the frame's visible bounds.

A Surface holds one mapping per Output it was ever on, each enabled or not, and
renders on every Output whose mapping is enabled: its enabled Outputs. A
disabled mapping keeps its corners, so putting the Surface back on an Output
restores that projector's calibration. A Surface with no enabled mapping is
projected by nothing. Changing the enabled Outputs changes the Installation, not
its Scenes.

### Calibration

The process and resulting data that aligns mapped geometry with the physical
installation.

Calibration data belongs to Surface Mappings and to any geometry that requires
physical alignment.

### Calibration Mode

A temporary Output presentation used while editing Surface Mappings, Regions,
Masks, or Paths. It is on one Output at a time, one of those the Surface is on,
while the Surface's other Outputs keep playing the Scene. It replaces Scene
playback on that Output with Surface patterns and bounds, or the Surface's
pattern already masked with the Mask, Path or Region being aligned drawn over it
with its points marked. While a Surface's quadrilateral or one of its Regions is
aligned, all its Regions are drawn as named outlines, so the operator sees them
follow the corners.

Blackout takes precedence: while it is on, the calibrated Output shows black and
the pattern returns when Blackout is released.

Masks are applied while calibrating a Mask or a Path, so the operator aligns
against the shape the audience will actually see. They are not applied while
calibrating a Surface's quadrilateral, where a Mask would hide the corners being
dragged.

Calibration Mode is operational Runtime state. It is not persisted and clears
when Studio exits it or the Studio session that entered it disconnects. While it
is active, the other Surfaces of the Output are hidden, drawn as outlines, or
drawn as dimmer patterns, as the operator chooses.

### Path

Named calibrated geometry a Visual follows without itself being a render Target,
such as `Plafond Perimeter`. A Path is an ordered sequence of 2–16
straight-segment points in Surface Space, open or closed, and belongs to one
Surface. It lights nothing by itself: Lightning Strikes erupts from one, Frame
Electric hums along one.

Point order gives a Path a direction: Side A is its left side and Side B its
right side while moving from the first point to the last. A Visual with a side
to choose offers it as a Parameter. Lightning Strikes offers Outward and Inward
instead, judged against the Path's centroid, so a frame drawn clockwise or
counterclockwise emits the same way.

A Surface's Regions, Masks and Paths share one order in the navigator; the order
is organizational only.

## Composition and rendering

### Visual

A reusable, code-defined rendering behavior such as `Koi Pond`, `Bubbles` or
`Solid Color`, listed in the Catalog.

A Visual is authored as a TypeScript module. It declares its Parameter Schema,
the Paths it needs and the Cues it answers to, and provides `create`, which
makes a Visual Instance; it is not created inside Studio.

### Visual Instance

One running copy of a Visual for one Layer on one Output Session or in Studio's
Preview. It holds its own state and is stepped every frame with the time elapsed
since the previous frame and the Layer's current Parameter Values, then draws
that state. Because it integrates time itself, a Parameter change alters what
happens next and never where things are now.

### Catalog

What a Runtime knows it can show, in four kinds of definition, each with a
stable id unique across all four: Visuals, Filters, Bundled Media (`media`) and
Bundled Fonts (`font`). Studio picks from the Catalog in the Library, the CLI
lists and describes it, and commands validate ids and Parameter Values against
it. A Visual, a Filter or a Bundled Media entry may carry notes for whoever
composes with it, and has a thumbnail rendered from it. A Layer referring to an
id the Catalog no longer has is shown as unavailable and renders nothing; the
file stays valid.

### Recommended

A flag a definition in the Catalog may carry: a good default for most
Installations. Recommended definitions sort first in the Library.

### Visual Backend

The rendering API used by a Visual implementation. Canvas 2D and shader are the
implemented Visual Backends. This is distinct from the compositor, which uses
WebGL2 to map and combine Layer results even when a Visual uses Canvas 2D.

### Filter

One configured instance of one registered, code-defined image transformation
inside a Scene. Where its Filter Layer sits decides what it transforms: at a
Scene's root or in a Group, the Projection Frame accumulated globally below its
position, across Surfaces; inside a Visual Layer, only that Layer's picture, in
the space of its Target, before the Layer's opacity, blend mode and Masks apply.
A Filter has an enabled value, universal mix, and complete Parameter Values. It
has no Visual, Target, opacity or blend mode. Both places use the same Catalog;
a Filter's notes say how it reads in each.

A Filter nested in a Group still affects globally lower content outside that
Group. A Filter inside a Visual Layer never reaches outside that Layer's Surface
and Masks. It is disabled when its Layer, or any Group or Visual Layer above it,
is disabled. At mix zero it preserves its input without a Filter pass. A
completely transparent input must produce a completely transparent output.

Do not call a Filter an Effect. Effect remains a broader unresolved term for a
future behavior that is neither a Visual nor a Filter.

### Parameter

A typed, definition-specific adjustable value such as color, speed, density, or
bolt width. A Parameter is one of six kinds: number, color, choice, boolean,
media or text. Each Visual Layer and Filter Layer stores its own Parameter
Values, keyed by Parameter name; picking a definition sets them to the
definition's defaults.

### Media

One image, video or Screen Share the Installation refers to, as an entity in the
`media` table. A Media item is of kind `file`, with a `path` relative to the
Installation File's folder, POSIX separators and `..` allowed, of kind
`bundled`, naming a Bundled Media entry by id, or of kind `share`, a Screen
Share. Its type is read from the file's extension (image: png, jpg, jpeg, webp,
gif, svg; video: mp4, webm, mov) or from the entry, is `live` for a Screen
Share, and is never stored. Items are arranged in Media Groups, and a name is
unique among its siblings. The Runtime serves a file at `GET /media/<id>` and
reports in the live state whether it is there: `ok`, `missing`, `outside` the
folder, or `unsaved` while the Installation has no file for the path to be
relative to; a bundled item is `ok`, or `unavailable` when the Runtime's Catalog
lacks its entry; a Screen Share is `idle`, `live` or `interrupted`.

### Screen Share

A Media item of kind `share`, of type `live`: a named slot a Sharer shares a
screen or window into. It is authored like any item, Layers point at it, and
someone shares into it at the show. The file holds the slot only: no file, and
nothing about who shares. In the live state it is `idle` while nobody shares,
`live` while a Sharer does, with the Sharer's name, whether it is a screen or a
window, since when and how many Viewers it has, and `interrupted` while the
Sharer's connection to the Runtime is gone, until the Sharer comes back or a
delay passes. A second Sharer replaces the first; anyone may stop a share. Do
not call it a stream, a feed or a capture.

### Sharer

The Difracta Desktop sharing into a Screen Share, named as its Display Host is
named. It captures on its own machine and sends the picture to each Viewer
directly; only a share's signalling goes through the Runtime. A share starts
only from the Sharer's own machine, in Desktop's share window.

### Viewer

A page receiving a Screen Share: an Output page, or Studio. Each has its own
connection to the Sharer, and a Screen Share takes a limited number of them. A
Viewer may wait for a slot nobody shares yet. An Output page views a slot while
a Layer of the Active Scene on one of its Surfaces names it, enabled or not, and
asks the Sharer for the picture again by itself when its connection drops. A
Studio window is one Viewer, whatever shows the share in it (the Preview, the
crop editor, the Screen Share's inspector), and views a slot only while a
picture of it is on screen.

### Beats

How many beats a video Media item lasts, such as 16 for a four-bar loop, with
its First Beat, the time in seconds of the first one, zero unless the clip
starts off the beat. The clip's own tempo follows from them and its length,
`beats × 60 / seconds`, and is never stored. A file's Beats are written on the
item; a bundled item's are its Bundled Media entry's and cannot be changed. An
item without Beats has no tempo to follow. Video's Sync to Tempo uses them to
play a clip at a song's tempo and to put its pulse on the beat.

Do not store or ask for a clip's BPM; it is what Beats make of its length.

### Bundled Media

The images and videos Difracta ships, from a pinned release of the
`difracta-media` repository, each with a stable id, a name, a description,
notes, a thumbnail, optional Recommended, Loop (loops without a seam) and Hit (a
one-shot on a beat) flags, and Beats for a clip with a steady pulse. They are
`media` definitions in the Catalog, so the Library, the CLI and validation know
them. A Media item of kind `bundled` refers to one by id; when the Runtime's
Catalog lacks that id the item stays in the file, unavailable, and shows
nothing.

### Media Parameter

A Parameter of kind `media` a Visual declares, holding a Media id or `""` for
none, restricted to one type (`accepts: "image" | "video" | "live"`). Its
Address lists the Media items of that type as its options, files, bundled items
or Screen Shares, in navigator order and without Groups, so a Macro can swap
artwork; it is not linkable. Removing the Media item, or the Group holding it,
clears every Media Parameter holding it.

### Text Parameter

A Parameter of kind `text` a Visual declares, holding the words it shows: at
most 2000 characters, on one line unless the declaration allows line breaks. A
Control commits it on Enter or when the field is left, never while typing, so a
half-typed word does not reach an Output. It can be linked to a Text Controller.

### Bundled Font

One of the typefaces Difracta ships, so text looks the same on every Output
whatever the machine has installed. They are `font` definitions in the Catalog,
each one weight, and a text Visual chooses one through its Font Parameter. The
Runtime serves their files at `GET /fonts/<file>` and an Output loads all of
them when it starts. For a character its font lacks, text falls back to the
first Bundled Font and then to the system's. Do not call a Bundled Font a
typeface family or a font file.

### Text

The built-in Visual that shows a Text Parameter's words on a Target in a Bundled
Font. Fit takes the largest size at which the wrapped text fits, Fill Width
spans the Target with the lines as typed, Fixed draws at Size and wraps. It has
a Fill Color and an outline and no Cues.

### Counter

The built-in Visual that shows a number its Cues move: Increment and Decrement
by Step, Reset back to Start, within Minimum and Maximum. The count belongs to
the Visual Instance, so it starts over when the Scene plays and is never saved.
Its Animation is how a digit becomes the next: Cut, Roll, Flip or Pop.

### Image

The built-in shader Visual that shows an image Media item on its Target, through
a Fit (cover by default, contain or stretch) and a Tint. The Output loads every
Media item ahead of use and uploads the picture to a texture once; the Layer is
blank until the picture is decoded or while the Parameter is `""`.

### Video

The built-in shader Visual that plays a video Media item on its Target, muted,
with the same Fit and Tint, Autoplay, Loop, Speed (the playback rate) and Hide
on Stop, and the Cues Play, Pause and Stop. Its transport is stopped, paused or
playing: Play from stopped starts at the first frame, from paused resumes, from
playing restarts; Pause holds the frame; Stop returns to the first frame, as
does ending without Loop. Every Layer on every Output plays its own copy of the
file on the browser's clock, and a hidden Layer pauses it. A stopped Layer holds
no video player, and Play takes the one the Output keeps ready for the Media
item; Keep Warm has the Layer hold its own while stopped.

### Live

The built-in shader Visual that shows a Screen Share on its Target as the Output
receives it: cropped by four Crop Parameters, Left, Top, Right and Bottom, each
the fraction of the picture cut from that side, then through the same Fit as
Image, which works on what the crops leave. Every Layer of an Output showing one
slot shares one picture. The Layer is blank while nobody shares and until a
frame arrives. On Signal Loss says what it does when the connection to the
Sharer drops while the share goes on: Hold keeps the last frame for a few
seconds and then goes blank, Blank shows nothing at once. It has no Tint and no
Cues. Live names the Visual and the Media type; the Media item is a Screen
Share.

### Controller

An Installation-owned, named value that Parameter Links spread over many Layers
across Scenes. A Controller has a fixed kind and a value that is saved with the
Installation: a Number Controller holds a value from zero through one, shown as
a percentage; a Color Controller holds one RGBA color; a Text Controller holds
text, line breaks allowed. Its value is the Address `controller/<id>/value`, so
Macros, OSC and the CLI move it like anything else.

Do not call a Color Controller a Palette. A Palette retains its deferred
multi-color meaning.

### Controller Group

A folder in the Controllers section of the navigator. It arranges Controllers
and other Groups and has no value of its own.

### Parameter Link

The relationship through which one Controller drives one Layer Address: a
number, boolean, color or text Parameter, opacity, mix or enabled. An Address
has at most one Parameter Link; linking it to another Controller moves it. In UI
prose, the target is "controlled by" its Controller, and the row shows the
effective value with no control of its own.

Color links copy the color, and text links the text, its line breaks becoming
spaces at a Text Parameter of one line; a Text Controller drives only Text
Parameters. Number links map Controller values zero and one to two anchors in
the target's units, interpolate linearly between them (reversed anchors invert),
and clamp and snap to the target's range and step. A boolean target is on from
one half. Choice Parameters cannot be linked. The value authored under a linked
Address stays in the document and takes over again, frozen at the last effective
value, when the Link goes.

### Macro

An Installation-owned, named, ordered list of actions run as one performance
step from its trigger Address `macro/<id>/run`. Each action sets an Address,
toggles a switch Address, or fires a trigger Address: a Layer's Cue, a Scene's
play, another Macro's run. A run performs the actions its Run Mode picks, in
list order, each seeing the effects of the ones before, best-effort: an action
that cannot run is skipped and reported, the rest run. Each action may have a
Chance. A Macro runs at most once per firing, however many Macros run it. Macros
are arranged in Groups like Controllers. Macro is not a synonym for Cue.

### Run Mode

How a Macro's run chooses among its actions. All runs every action; One runs one
picked at random; Some runs a count of them picked at random; Sequence runs the
next action in list order each time and starts over after the last. A Sequence's
position is show state, kept while the Installation is open and never saved, so
it starts at the top when the Installation opens. Picking is not a synonym for
skipping: an action a run did not pick is not reported.

### Chance

The probability, from 0 to 1 and shown as a percent, that an action fires once
its Macro's Run Mode picked it. An action without a Chance always fires. An
action that loses its roll does nothing, silently; in a Sequence the position
still moves on. Chance is per action; there is no Chance on a Macro.

### Macro Group

A named folder of Macros in the navigator, nested as needed. A Group only
arranges; it has no run of its own.

### Media Group

A folder in the Media section of the navigator. It arranges Media items and
other Groups and has no file of its own; a Media Parameter never holds one.

### Cue

A named performable behavior declared in a Visual's code metadata and invoked on
a Layer, such as Blink on Blink or Flash on Thunder. Each Cue of a Layer is a
trigger Address, `layer/<id>/cue/<key>`. Firing it is transient live input: the
Runtime announces it to every session, an Output hands it to the Layer's Visual
Instance, and it is neither persisted nor replayed to reconnecting Outputs.

A Cue has no payload. Its behavior uses the Layer's current ordinary Parameter
Values, and the Visual Instance keeps what it needs of the Cue for as long as
its effect is visible. A Macro may contain a Trigger Cue action, but the
persisted action and the transient firing remain distinct concepts.

### Automatic Rate

A number Parameter used by event-based Visuals to request an average number of
Cue-equivalent automatic occurrences per second. Zero means automatic
occurrences are Off. Every Visual declares it the same way, and the Visual
Instance spaces occurrences around the mean with some jitter, carrying its
progress toward the next one across rate changes; per-occurrence counts such as
Bursts per Launch remain separate Parameters.

### Parameter Schema

A Visual module's typed declaration of its Parameters, including types,
defaults, constraints, and editor metadata. Studio uses it to produce
appropriate Controls.

### Palette

A deferred color-sampling value that may eventually provide discrete colors or a
continuous gradient to a Visual. Current Visuals use explicit Color Parameters;
do not use Palette as a synonym for a single Color.

### Path Binding

A Visual declares the Paths it follows by key, such as `frame`; a Visual Layer
binds one Path of the Installation to each key. For example, a Lightning Strikes
Layer binds its `frame` to the `Plafond Perimeter` Path.

A Path Binding is not a Parameter. Every declared Path is required, and the
bound Path must belong to the same Surface as the Layer's Target: a Layer with
one unbound renders nothing until a Path is picked, and a Target or Visual
change drops the bindings that no longer fit rather than being refused.

### Layer

One entry in a Scene's stack. Every Layer has a name, an enabled state and a
position among its siblings, under the Scene's root, inside a Group or, for a
Filter Layer, inside a Visual Layer. A Layer is one of three kinds: a Visual
Layer, a Filter Layer or a Group. Adding a Visual, a Filter or a Group is the
same gesture with a different kind, and all three reorder, move, duplicate and
hide the same way.

### Visual Layer

A Layer that renders one Visual into a Target, with Parameter Values, an opacity
and a blend mode. It renders RGBA content over a transparent background; the
order of Layers controls composition where pixels overlap. A Visual Layer may
contain Filter Layers, which transform its picture alone, the bottom one first;
its opacity, blend mode and the Target's Masks apply after them, so fading a
mirrored clip fades the mirrored picture. It holds nothing else: no Group and no
Visual Layer goes inside it. A Visual Layer may exist without a Visual or a
Target yet, or with a Path its Visual declares unbound, in which case it renders
nothing, and neither do its Filter Layers.

### Filter Layer

A Layer that holds one Filter, with a mix from zero through one. At a Scene's
root or inside a Group it transforms the Projection Frame accumulated below its
position, and a Filter Layer inside a Group still affects content below that
Group. It may sit inside a Visual Layer instead, where it transforms only that
Layer's picture in its Target; the Visual Layer's Filter Layers apply bottom
first, in stack order. Moving a Filter Layer in or out keeps its id, so its
Links and Macro actions stay. It has no Target, opacity or blend mode. A Filter
Layer may exist without a Filter yet, in which case its input passes through it
unchanged.

### Group

A Layer that contains an ordered stack of Layers, Groups included. A Group has
no Visual, Target, opacity or blend mode, and is not a compositing boundary: its
contents draw as if they sat at its position in the Scene. Disabling a Group
hides everything inside it without changing what those Layers have authored. A
Group never goes inside a Visual Layer.

### Target

The Surface, or the Region of a Surface, into which a Layer may render. The
Target provides bounds, clipping and the unit space the Visual draws in; it is
not an Output. Both kinds resolve to one owning Surface, which supplies the
mapping, the Masks and the Paths a Layer on it may bind.

### Scene

A saved, ordered stack of Layers for an Installation, topmost first. For
example, a Live Set Scene places Stars and Lightning Bolts on the Ceiling and
Sun on the Plafond.

Scenes are independent of Output assignment.

### Scene Background

The fixed transparent base over which a Scene's Layers are evaluated. It is not
an editable Scene color. After composition, unresolved transparency becomes
black when the final Projection Frame is produced.

Use a bottom `Solid Color` Layer when an explicit colored or black background is
needed.

### Active Scene

The Scene currently rendered by an Installation's Outputs. Studio may select and
edit a different Scene without changing the Active Scene. Playing a Scene makes
it active with an immediate cut. The first Scene created becomes active; the
Active Scene cannot be removed until another is played. It is saved with the
Installation, so a show reopens where it left off.

### Blackout

A temporary per-Installation Runtime state that replaces ordinary Scene output
with black without changing the Active Scene. Blackout is not persisted. It
takes precedence over Calibration Mode: an Output under Blackout shows black
even while one of its Surfaces is being calibrated, so the wall is dark the
moment the performer asks for it. Studio's Preview is not darkened: it keeps
showing what the Outputs would without Blackout.

## Applications and user interface

### Studio

The browser UI used to calibrate an Installation, compose Scenes, edit selected
Layers, and control playback. Do not call the whole application `Control`.

### Desktop

The installable application: a window showing Studio. In **local mode** it
starts a Runtime on the same machine and stops it when it quits, with native
dialogs for opening and saving Installation files and the operating system's
ways of opening one (a double click, recent documents). In **remote mode** it
starts none and shows the Studio of a Runtime running elsewhere. Its **launch
page** is where a person chooses between them. Studio inside Desktop is the same
Studio a browser shows. Do not call it `the app`, `the Electron app` or
`the shell`.

### Output page

The fullscreen browser experience that renders one Output's Projection Frames on
the mini-PC. The Output page is not the physical Projector.

### Output Session

One Output page tab attached to one Output through the Runtime. An Output may
have several at once (a display and a browser tab, say); each reports its own
Output Telemetry. A session that stops reporting is stale, then dropped.

### Display

A physical screen attached to a machine, as that machine's operating system
describes it: a monitor, a TV, a Projector's input. A Display is where an Output
can be shown; it is not the Output (what is rendered) nor the Projector (the
device in the room). Do not call it `screen` or `monitor`.

### Display Host

A Desktop's connection to a Runtime that offers the Displays of its machine for
showing Outputs. It says which Displays it has and which Output each shows, and
carries out the Runtime's requests to show an Output on one or to stop. Any
client of that Runtime may make those requests, from any machine. Like an Output
Session it exists only while connected and is never saved. Do not call it
`display server` or `screen host`.

### Display window

The window a Display Host opens to show an Output on a Display: an Output page
covering that Display, full screen, without a frame and above every other
window. It is an Output Session like any other. Not the same as an Output page
opened in an ordinary window of Desktop or in a browser tab.

### Share window

The window of Difracta Desktop a person shares this computer's screens and
windows from, opened with File ▸ Share Screen...: it lists the shares this
computer runs, each with its Screen Share, a small picture of what is captured,
its Viewers and Stop, and starts another. Starting one means choosing the Screen
Share, Sharp (text and slides) or Smooth (video), whether the cursor shows, and
the screen or window. Closing it while it shares hides it; the shares go on. Its
page is Desktop's own, not one a Runtime serves. Do not call it the share dialog
or the picker: the picker is the part of it, or of the operating system, that
asks which screen or window.

### Placement

One Output put on one Display of a computer. A Desktop keeps its placements per
Installation, in its own state and not in the Installation, and shows them again
when that Installation is open. Hiding drops a placement; quitting does not.

### Runtime

The authoritative process on the mini-PC. It holds one Installation at a time,
owns current in-memory state, coordinates live edits, and synchronizes Studio
and Output pages.

### OSC

Open Sound Control, the trusted-LAN transport through which a show-control hub
such as Chataigne sets Controller values and runs Macros, with or without Studio
open. The Runtime listens on one UDP port; a Controller's address is
`/controller/<id>`, a Macro's `/macro/<id>`, stable across renames. An OSC
message becomes the same command Studio would send.

### OSCQuery

The HTTP and WebSocket protocol through which a hub discovers the Runtime's OSC
tree with names, types, ranges and current values, listens for value changes
streamed back to it, and learns when the tree changes. The Runtime announces it
on the local network with Zeroconf.

### Revision

A monotonically increasing number per open Installation, advanced by the runtime
after each accepted command that changes the Document. Deltas carry the revision
they apply on top of and the one they produce; a client that observes a gap
resubscribes. Revision is distinct from the file format version.

### Address

The name of one controllable property or trigger in an Installation, such as
`installation/blackout` or `layer/<id>/opacity`. An Address resolves to a value
type (boolean, number, color, choice, media, text or trigger), a default and,
for numbers, a range. Layer enabled, opacity, blend mode, mix and every
Parameter have one. Controllers, Parameter Links, Macros, OSC and the CLI all
read and write Addresses; the Inspector edits them through undoable commands.

### Command

The only way an Installation changes: a named, validated operation that produces
patches. Authoring Commands enter undo history and dirty the Installation;
Performance Commands are live show input and do neither. Commands carry a
request id for acknowledgement and are ordered by Runtime arrival, not by the
client's last observed Revision.

### Output Telemetry

Live performance measurements an Output Session reports once a second and the
Runtime relays to Studio as live state: resolution, pixel ratio, Frame Interval,
Render Work and workload counts: the canvas Layers, shader Layers and Filters
run per frame, and the video players playing, the ones held and the Layers that
take a video. More players playing than hardware decoders work at the same
moment is shown as a warning.

### Frame Interval

The rolling average elapsed time between Output animation frames, expressed in
milliseconds per frame. The initial 24 fps minimum corresponds to a 41.7 ms
maximum average Frame Interval.

### Render Work

The rolling average time spent invoking Visuals and composing one Projection
Frame. It helps diagnose Frame Interval but is not a precise GPU measurement.

### Inspector

The Studio panel for the selected object, especially a selected Layer. A Layer
Inspector starts with what the Layer is made of and the way into the Library,
then its name, then collapsible sections of Address rows: Layer settings,
Parameters, and Path Bindings. Each row has a label, a Control and a reset to
the default when the value differs from it.

### Library

The Studio view for picking from the Catalog. It is bound to one Layer, to pick
its Visual or Filter, or to one bundled Media item, to pick its Bundled Media
entry, and takes the center column while open, under the Preview when that is
the tab in use, with search, facets and a grid of thumbnails. Picking applies at
once, so the Outputs and the Preview show each candidate; Enter keeps the pick
and Escape discards the browse, putting the previous one back.

### Preview

Studio's own rendering of an Output, of a Surface flat or of a Layer, in a tab
of the center column. It follows the selection or stays on a named Output. It is
representative, not identical to what an Output Session shows: its Visual
Instances are its own, so what is random or counted per instance may differ.
Blackout does not darken it; Calibration Mode shows in it on an Output. The
Preview is not an Output Session and not an Output page. Do not call an Output
page opened in a window `a preview`.

### Framing

How close the Preview shows what is selected while it follows the selection:
Output, Surface or Layer, the closest one allowed. Output shows the Output the
selection is on as its projector gets it. Surface shows the selection's Surface
flat: filling the frame, undistorted, alone, under the Scene's Filter Layers.
Layer shows a selected Layer with only what it draws with: a Visual Layer alone
on the flat Surface of its Target, with its own Filter Layers applied and no
other; a Filter Layer inside a Visual Layer as that Layer on its Target, with
the Filter Layers from the bottom up to and including itself; a root Filter
Layer with the stack below it on the Output shown; a Group with only what is in
it on the Output shown.

### Control

One UI widget used to edit a value, such as a slider, color picker, checkbox, or
select. The containing application is Studio and the containing panel is an
Inspector. The Control for an Address follows its value type: a slider with a
typed readout for numbers, a color input with hex and alpha for colors, a select
for choices, a switch for booleans.

## Documents and files

### Installation File

A `.difracta` file holding exactly one Installation as versioned JSON with
sorted keys. It is the unit of saving, opening, sharing, and version control.
Operational state is never written to it.

### Autosave

A sidecar file `<name>.<timestamp>.autosave.difracta` the runtime writes next to
a dirty Installation File on a short debounce. Opening an Installation File
whose Autosave is newer loads the Autosave, and Studio offers to save it or
revert to the file. A successful save or a revert removes it.

### Document Mode

What a connection may do with the Runtime's Installation File, decided by how
the Runtime was started. **Pinned**: the Runtime holds the one file it was
started with; clients save and revert it, and cannot create, open or close an
Installation nor save it to another path. **Free**: clients on the Runtime's own
machine can do all of those; a client on another machine is still pinned.

## Deferred terminology

Effect, Overlay, and Transition are intentionally not part of the current domain
model. They will be reconsidered once ordinary Scenes and live playback are
proven.
