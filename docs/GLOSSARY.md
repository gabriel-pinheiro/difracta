# Glossary

Canonical vocabulary for Difracta, revised as the project grows. Terms describe
intended scope; a term may name a concept not yet implemented. Prefer these
terms in code, UI text, docs, and conversation.

## Physical and mapped space

### Installation

One complete projection setup and its configuration.

An Installation owns Outputs, Surfaces, Surface Mappings, Regions, Masks,
Guides, Scenes, Controllers, Parameter Links, Macros, Pads, and Color Pickers.

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
as `Ceiling` or `Plafond`.

A Surface belongs to the Installation rather than an Output. Surface shapes may
overlap when mapped into the same Projection Frame.

### Surface Space

The local coordinate system in which a Surface's Regions, Guides, and Visual
content are described. Rendering is transformed from Surface Space through a
Surface Mapping into an Output's Projection Frame.

Surface Space is the normalized unit rectangle from `(0, 0)` at its top-left to
`(1, 1)` at its bottom-right.

### Render Scale

A Surface setting (0.25×–2×, default 1×) that multiplies the resolution of the
engine-owned canvases its Canvas 2D Visuals render into. It trades sharpness for
rendering throughput and does not change composition, Surface Space, or Shader
Visuals.

### Mask

A named polygon in Surface Space that decides which parts of its owning Surface
receive projection, such as the real trapezoidal shape of a wall or an outlet on
it.

A Mask belongs to a Surface, not to a Surface Mapping: it records a physical
fact about the receiving surface and therefore travels with the Surface when its
enabled Output changes. It is `include`, meaning only its area is lit, or
`exclude`, meaning its area is never lit, and it has 3–16 points forming a
closed polygon plus its own feather amount.

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

The assignment and calibration relationship between one Surface and one Output.
It transforms Surface Space into the Output's Projection Frame and may include a
mesh and calibration metadata.

For the initial engine, a Surface can have zero or one enabled Surface Mapping.
It may retain dormant mappings for other Outputs so reassignment restores each
projector's calibration. Changing its enabled Output changes the Installation,
not its Scenes.

### Calibration

The process and resulting data that aligns mapped geometry with the physical
installation.

Calibration data belongs to Surface Mappings and to any geometry that requires
physical alignment.

### Calibration Mode

A temporary Output presentation used while editing Surface Mappings, Masks,
Regions, or Guides. It replaces Scene playback on one selected Output with
Surface patterns and bounds, neutral Guide calibration imagery, the Surface's
pattern already masked, or a filled Region over its dimmed Surface.

Masks are applied while calibrating a Mask or a Guide, so the operator aligns
against the shape the audience will actually see. They are not applied while
calibrating a Surface's quadrilateral, where a Mask would hide the corners being
dragged.

Calibration Mode is operational Runtime state. It is not persisted and clears
when Studio exits it or disconnects.

### Region

A named two-dimensional subsection of a Surface. A Region is a reusable render
Target, such as `Ceiling Surround` or `North Ceiling`.

A Region is an axis-aligned rectangle in its Surface's own Surface Space,
described by two opposite corners. It inherits that Surface's calibration
exactly and adds no perspective of its own, so placing content inside a Surface
is a matter of choosing bounds rather than calibrating a second quadrilateral.
Regions on one Surface may overlap.

Use the whole Surface when no subsection is needed. Do not create thin
rectangular Regions to represent lines.

### Region Space

The normalized unit rectangle a Region presents to the Visual targeting it, from
`(0, 0)` at the Region's top-left corner to `(1, 1)` at its bottom-right. A
Region spanning its whole Surface is identical to targeting the Surface.

Aspect ratio is not corrected: a tall narrow Region squashes a circular Visual
into an ellipse exactly as a wide Surface already does.

### Guide

Named calibrated geometry that influences a Visual without itself being a render
Target. Guides provide reusable spatial inputs.

### Path

A line-shaped Guide, such as `Plafond Perimeter`. A Lightning Bolts Visual can
bind its origin to a Path. The initial Path is an ordered sequence of 2–16
straight-segment points in normalized Surface Space and may be open or closed.

Point order gives an open Path a directed line: Side A is its left side and Side
B is its right side while moving from the first point to the last. Visuals may
interpret these sides through a Parameter. Lightning presents Side A as Outward
and Side B as Inward for a closed Path, using the Path's centroid to make that
meaning independent of clockwise or counterclockwise authoring.

### Anchor

A point-shaped Guide, such as the center of the Plafond or an emission origin.

## Composition and rendering

### Visual

A reusable, code-defined rendering behavior such as `Sun`, `Stars`,
`Lightning Bolts`, or `Solid Color`.

A Visual is authored as a TypeScript module. It declares its Parameter Schema
and required Guide Bindings and implements rendering; it is not created inside
Studio.

### Visual Backend

The rendering API used by a Visual implementation. Canvas 2D and shader are the
implemented Visual Backends. This is distinct from the compositor, which uses
WebGL2 to map and combine Layer results even when a Visual uses Canvas 2D.

### Filter

One configured instance of one registered, code-defined image transformation
inside a Scene. A Filter transforms the Projection Frame accumulated globally
below its position and has an enabled value, universal mix, and complete
Parameter Values. It has no Visual, Target, opacity, blend mode, or random seed.

A Filter nested in a Layer Group still affects globally lower content outside
that Group. It is disabled when it or any ancestor Group is disabled. At mix
zero it preserves the accumulated image without a Filter pass. A completely
transparent input must produce a completely transparent output.

Do not call a Filter an Effect. Effect remains a broader unresolved term for a
future behavior that is neither a Visual nor a Filter.

### Parameter

A typed, definition-specific adjustable value such as color, speed, density, or
bolt width. Each Layer Visual and Filter stores its own Parameter Values.

### Controller

An Installation-owned, named shared value used to coordinate compatible
Parameters and Filter mix across Scenes. A Controller has a fixed type and a
current authored value. Color Controllers contain one RGBA color; Number
Controllers contain a normalized value from zero through one.

Do not call a Color Controller a Palette. A Palette retains its deferred
multi-color meaning.

### Parameter Link

The Installation-owned relationship through which one Controller drives one
compatible Visual Parameter on a Layer, Filter Parameter, or universal Filter
mix. A concrete target may have at most one Parameter Link. In UI prose, the
target is "controlled by" its Controller.

Color links apply RGBA exactly. Number links map Controller values zero and one
to two legal values in the target Parameter's range, then linearly interpolate
and quantize to that Parameter's minimum-anchored step grid. Choice Parameters
cannot be linked.

### Macro

An Installation-owned, named, reusable ordered list of performance actions.
Triggering a Macro evaluates its actions in creation order and publishes the
successful final Installation and operational state together. Execution is
best-effort: a failed action is logged by Runtime and later actions continue.

The initial actions can play a Scene, set a Controller value, show, hide, or
toggle a Composition Item, set Layer opacity, and enable, disable, or toggle
Blackout. They can also trigger a Cue declared by a Layer's current Visual.
Macro is not a synonym for Cue.

### Pad

One of the 64 fixed positional performance controls in an Installation's 8×8
Launchpad. A Pad has an optional name, display color, Macro to trigger on press,
Macro to trigger on release, and physical keyboard-code binding.

Pad press and release are best-effort Studio browser events rather than
authoritative held state in Runtime. A Pad is not a Macro or Cue; it invokes its
currently assigned Macros through the ordinary Macro trigger path.

### Color Picker

An Installation-owned, named performance control with the fixed ordered colors
White, Red, Orange, Amber, Yellow, Green, Cyan, Blue, Purple, and Magenta. A
Color Picker targets zero or more Color Controllers and other Color Pickers.
Selecting one color applies its exact opaque RGBA value to every reachable Color
Controller and transiently selects the same color on every reachable Color
Picker. OSC may instead apply any RGBA value through the same Picker graph; the
exact value reaches the Controllers while the nearest fixed color is selected
transiently for Studio presentation.

Color Picker configuration is persisted, but its selected color is not. Studio
therefore loads and reconnects with every Color Picker unselected. Picker graphs
may contain cycles; one selection visits each reachable Picker once. A Color
Picker is not a Color Controller or a user-authored Palette.

### Cue

A named performable behavior declared in a Visual's code metadata and invoked on
a Layer, such as Blink on Blink or Flash on Thunder. A Cue occurrence is
transient live input: Runtime gives it a unique identity, Outputs start it on
local message arrival, and it is neither persisted nor replayed to reconnecting
Outputs.

A Cue has no payload. Its behavior uses the Layer's current ordinary Parameter
Values. A Macro may contain a Trigger Cue action, but the persisted action and
the transient Cue occurrence remain distinct concepts.

### Automatic Rate

A number Parameter used by event-based Visuals to request an average number of
Cue-equivalent automatic occurrences per second. Zero means automatic
occurrences are Off. Automatic timing is deterministically jittered from
playback time and the Layer seed; per-occurrence counts such as Bursts per
Launch remain separate Parameters.

### Parameter Schema

A Visual module's typed declaration of its Parameters, including types,
defaults, constraints, and editor metadata. Studio uses it to produce
appropriate Controls.

### Palette

A deferred color-sampling value that may eventually provide discrete colors or a
continuous gradient to a Visual. Current Visuals use explicit Color Parameters;
do not use Palette as a synonym for a single Color.

### Guide Binding

A connection from a named geometric input declared by a Visual to a compatible
Guide in the Installation. For example, a Lightning Bolts Layer can bind its
`origin` input to the `Plafond Perimeter` Path.

A Guide Binding is not a Parameter.

Every declared Guide Binding is required. Its Guide must have the declared kind
and belong to the same Surface as the Layer's Target.

### Layer

One configured instance of one Visual inside a Scene. A Layer has a Target,
Parameter Values, Guide Bindings, visibility, opacity, and a position in the
Scene's global order.

Layers render RGBA content over transparent backgrounds. Their order controls
composition where rendered pixels overlap.

### Layer Group

An organizational item that contains an ordered recursive composition of Layers,
Filters, and other Layer Groups. A Layer Group has a stable identity, name, and
authored visibility gate. It is not a Layer: it has no Visual, Target, opacity,
blend mode, or rendering boundary.

Disabling a Layer Group hides its descendants without changing their authored
visibility. Studio may label a Layer Group simply `Group`.

### Composition Item

The shared union of Layer, Filter, and Layer Group. A Scene and every Layer
Group own an ordered composition of Composition Items.

### Target

The Surface or Region into which a Layer may render. The Target provides bounds,
clipping, and Surface Space; it is not an Output.

### Scene

A saved, ordered recursive composition of Layers, Filters, and Layer Groups for
an Installation. For example, a Live Set Scene places Stars and Lightning Bolts
on the Ceiling and Sun on the Plafond.

Scenes are independent of Output assignment.

### Scene Background

The fixed transparent base over which a Scene's Composition Items are evaluated.
It is not an editable Scene color. After composition, unresolved transparency
becomes black when the final Projection Frame is produced.

Use a bottom `Solid Color` Layer when an explicit colored or black background is
needed.

### Active Scene

The Scene currently rendered by an Installation's Outputs. Studio may select and
edit a different Scene without changing the Active Scene. Playing a Scene makes
it active with an immediate cut.

### Blackout

A temporary per-Installation Runtime state that replaces ordinary Scene output
with black without changing the Active Scene. Blackout is not persisted;
Calibration Mode takes precedence on its selected Output.

## Applications and user interface

### Studio

The browser UI used to calibrate an Installation, compose Scenes, edit selected
Layers, and control playback. Do not call the whole application `Control`.

### Output page

The fullscreen browser experience that renders one Output's Projection Frames on
the mini-PC. The Output page is not the physical Projector.

### Output Session

One Output page tab attached to one Output through the Runtime. An Output may
have several at once (a display and a preview tab, say); each reports its own
Output Telemetry. A session that stops reporting is stale, then dropped.

### Runtime

The authoritative process on the mini-PC. It holds one Installation at a time,
owns current in-memory state, coordinates live edits, and synchronizes Studio
and Output pages.

### OSC

Open Sound Control, the trusted-LAN transport through which external
show-control software can trigger Macros and set Controller values while Studio
is closed. Difracta accepts exact, stable ID-based addresses; OSC is an inbound
protocol boundary, not an Installation-owned entity or an automation engine.

### OSCQuery

The read-only HTTP discovery protocol that describes Difracta's writable OSC
Macro and Controller methods. It supplies current human-facing names and values
while stable identities remain in each OSC address. OSCQuery does not mutate
Runtime state and is distinct from OSC message transport.

### Revision

A monotonically increasing number per open Installation, advanced by the runtime
after each accepted command that changes the Document. Deltas carry the revision
they apply on top of and the one they produce; a client that observes a gap
resubscribes. Revision is distinct from the file format version.

### Address

The name of one controllable property or trigger in an Installation, such as
`installation/blackout` or `layer/<id>/opacity`. Controllers, Parameter Links,
Macros, Pads, Color Pickers, OSC, and the CLI all read and write Addresses.

### Command

The only way an Installation changes: a named, validated operation that produces
patches. Authoring Commands enter undo history and dirty the Installation;
Performance Commands are live show input and do neither. Commands carry a
request id for acknowledgement and are ordered by Runtime arrival, not by the
client's last observed Revision.

### Output Telemetry

Live performance measurements an Output Session reports once a second and the
Runtime relays to Studio as live state: resolution, pixel ratio, Frame Interval,
Render Work and workload counts.

### Frame Interval

The rolling average elapsed time between Output animation frames, expressed in
milliseconds per frame. The initial 24 fps minimum corresponds to a 41.7 ms
maximum average Frame Interval.

### Render Work

The rolling average time spent invoking Visuals and composing one Projection
Frame. It helps diagnose Frame Interval but is not a precise GPU measurement.

### Inspector

The Studio panel for the selected object, especially a selected Layer. A Layer
Inspector contains general Layer settings, Visual Parameters, and Guide
Bindings.

### Control

One UI widget used to edit a value, such as a slider, color picker, checkbox, or
select. The containing application is Studio and the containing panel is an
Inspector.

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

## Deferred terminology

Effect, Overlay, and Transition are intentionally not part of the current domain
model. They will be reconsidered once ordinary Scenes and live playback are
proven.
