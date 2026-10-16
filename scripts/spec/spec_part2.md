
## 10. Forward kinematics

Forward kinematics (FK) turns joint angles into positions. You need it to draw the arm in a simulator, to check the geometry rules of section 11, and to reason about where the hand goes.

### 10.1 Source

The kinematic parameters come from the YAM robot description by i2rt (`yam_description/i2rt/yam.urdf`, from github.com/i2rt-robotics/i2rt, as vendored by DimOS). Only the joint origins, axes and limits are reproduced here. **The meshes (STL files) are not included in this spec and are not needed**: draw the links as simple shapes between the frame origins (section 13 does). The numbers below are copied verbatim from the URDF.

### 10.2 Kinematic chain

Serial chain `base → link1 → link2 → link3 → link4 → link5 → gripper → gripper_tip`. All six arm joints are revolute.

| Joint | Parent → child | origin xyz (m) | origin rpy (rad) | axis (in child frame) |
|---|---|---|---|---|
| joint1 (j1) | base → link1 | (-2.49777947129965e-07, -9.17402363407408e-13, 0.0679999999995413) | (0, 1.5708, 3.1415963267949) | (-1, 0, 0) |
| joint2 (j2) | link1 → link2 | (-0.0455, -0.0339, -0.02) | (-1.7953e-16, 5.55112e-17, -3.14159) | (3.58252e-15, 1, -3.2007e-16) |
| joint3 (j3) | link2 → link3 | (4.08431e-07, -0.0688, 0.264) | (-2.99502e-14, -1.6015e-14, -3.14159) | (4.54273e-15, 1, 1.04275e-14) |
| joint4 (j4) | link3 → link4 | (-0.0600003, -0.0688, -0.244999) | (2.95536e-14, 8.52374e-14, -2.10585e-14) | (0, 1, 0) |
| joint5 (j5) | link4 → link5 | (-0.0405003, 0.0338995, -0.0739989) | (2.73264e-14, -4.32956e-16, -8.32667e-17) | (1, 0, 0) |
| joint6 (j6) | link5 → gripper | (0.0404996, 2.39858e-07, -0.0356) | (8.83309e-16, -5.88588e-16, 7.69861e-14) | (1.46014e-15, 2.40808e-14, -1) |
| gripper_tip_joint (fixed) | gripper → gripper_tip | (0, 0, -0.1) | (0, 0, 0) | (none) |
| joint7 (prismatic, left finger) | gripper → tip_left | (-0.0239931, 0.0445119, -0.0566829) | (≈0, ≈0, ≈0) | (≈0, 1, 0), stroke -0.04695 .. 0 m |
| joint8 (prismatic, right finger) | gripper → tip_right | (0.0239931, -0.0445119, -0.0566829) | (≈0, ≈0, ≈0) | (≈0, -1, 0), stroke -0.04695 .. 0 m |

The tiny values (1e-14 and below) are numerical noise from CAD export; keeping or zeroing them changes positions by less than 1e-12 m. The finger joints are only needed for drawing and for the link-height check (evaluate them at 0).

### 10.3 Procedure

URDF conventions: each joint's origin is a translation `xyz` followed by a rotation from fixed-axis roll-pitch-yaw, `R = Rz(yaw) · Ry(pitch) · Rx(roll)`. The joint then rotates by `q` about its `axis`, expressed in the child frame.

```
T = identity (4x4)                                   # base frame
for i in 1..6:
    T = T · Origin(xyz_i, rpy_i) · Rot(axis_i, q_i)  # frame of link_i (link1..link5, gripper)
    position of link_i = T[0:3, 3]
tip = T · [0, 0, -0.1, 1]                            # gripper_tip
```

with

```
Origin(xyz, (r, p, y)) = | cy*cp   cy*sp*sr - sy*cr   cy*sp*cr + sy*sr   x |
                         | sy*cp   sy*sp*sr + cy*cr   sy*sp*cr - cy*sr   y |
                         | -sp     cp*sr              cp*cr              z |
                         | 0       0                  0                  1 |
   (cr = cos r, sr = sin r, cp = cos p, sp = sin p, cy = cos y, sy = sin y)

Rot(axis, a): Rodrigues rotation about the unit vector (x, y, z) = axis / |axis|,
   c = cos a, s = sin a, C = 1 - c:
   | c + x*x*C     x*y*C - z*s   x*z*C + y*s   0 |
   | y*x*C + z*s   c + y*y*C     y*z*C - x*s   0 |
   | z*x*C - y*s   z*y*C + x*s   c + z*z*C     0 |
   | 0             0             0             1 |
```

The frame "position of link_i" is the position of joint i's axis (the joint origin). Draw the arm as cylinders between consecutive positions: link1 (top of the base) → link2 (shoulder) → link3 (elbow) → link4 (wrist pitch) → link5 (wrist yaw) → gripper (wrist roll / hand mount), then a hand from the gripper frame toward the tip.

Both reference implementations (sections 13 and 14) implement exactly this. They match pinocchio on the original URDF to within 1e-14 m on 200 random poses.

### 10.4 Reference positions (self-test)

Gripper tip and gripper-mount positions, base frame, metres (pinocchio on the URDF; your FK should match to 0.1 mm):

| Pose | q | gripper_tip (x, y, z) | gripper (x, y, z) |
|---|---|---|---|
| home | `[0, 0, 0, 0, 0, 0]` | (0.2106, 0.0000, 0.1735) | (0.1106, 0.0000, 0.1735) |
| ready | `[0, 0.5, 0.8, 0, 0, 0]` | (0.2049, 0.0000, 0.4317) | (0.1093, 0.0000, 0.4022) |
| up (top of a pump) | `[0, 0.85, 1.2, -0.2, 0, 0]` | (0.2626, 0.0000, 0.4835) | (0.1637, 0.0000, 0.4686) |
| bow (real bow, see 12.3) | `[0, 1.1, 0.9, -0.6, 0, 0]` | (0.2983, 0.0000, 0.2086) | (0.2286, 0.0000, 0.2803) |
| hand raised (wave pose) | `[0, 0.7, 1.1, -0.3, 0, 0]` | (0.2289, 0.0000, 0.4552) | (0.1294, 0.0000, 0.4452) |
| look left | `[0.6, 0.5, 0.8, 0, 0, 0]` | (0.1691, 0.1157, 0.4317) | (0.0902, 0.0617, 0.4022) |
| stretch tall | `[0, 0.6, 1.5, -0.3, 0, 0]` | (0.0804, 0.0000, 0.6101) | (-0.0021, 0.0000, 0.5537) |
| wrist yaw +0.5 | `[0, 0.5, 0.8, 0, 0.5, 0]` | (0.1890, -0.0650, 0.4268) | (0.1052, -0.0171, 0.4009) |
| wrist roll +1.0 | `[0, 0.5, 0.8, 0, 0, 1.0]` | (0.2049, 0.0000, 0.4317) | (0.1093, 0.0000, 0.4022) |
| mixed | `[-0.4, 0.9, 1.3, 0.5, -0.3, 0.7]` | (0.1857, -0.0350, 0.6304) | (0.1195, -0.0391, 0.5556) |

All frames at `ready` (m):

| frame | x | y | z |
|---|---|---|---|
| link1 (j1 axis, top of base) | 0.0000 | 0.0000 | 0.0680 |
| link2 (shoulder, j2) | 0.0200 | 0.0339 | 0.1135 |
| link3 (elbow, j3) | -0.2117 | -0.0349 | 0.2401 |
| link4 (wrist pitch, j4) | 0.0046 | 0.0339 | 0.3698 |
| link5 (wrist yaw, j5) | 0.0634 | 0.0000 | 0.4304 |
| gripper (wrist roll, j6) | 0.1093 | 0.0000 | 0.4022 |
| gripper_tip | 0.2049 | 0.0000 | 0.4317 |
| tip_left (finger, at 0) | 0.1564 | -0.0445 | 0.4419 |
| tip_right (finger, at 0) | 0.1706 | 0.0445 | 0.3960 |

And at `home`: link1 (0, 0, 0.068), link2 (0.020, 0.0339, 0.1135), link3 (-0.244, -0.0349, 0.1135), link4 (0.001, 0.0339, 0.1735), link5 (0.075, 0, 0.214), gripper (0.1106, 0, 0.1735), gripper_tip (0.2106, 0, 0.1735).

Note that j1 does not change link1's or link2's height, and the shoulder (link2) is always at z = 0.1135 m. The elbow (link3) sits *behind* the base (x < 0) in most poses; that is normal for this arm.

---

## 11. Workspace and safety rules

### 11.1 Geometry rules

In addition to the joint-space validator, a playable MUST keep, at every 100 Hz sample of the timeline:

| Rule | Limit | Why |
|---|---|---|
| gripper tip height | `tip z >= 0.08 m` | the table is at z = 0; 8 cm leaves room for sag and for objects on the table |
| every link frame except `base` and `link1` (link2..link5, gripper, gripper_tip, tip_left, tip_right with fingers at 0) | `z >= 0.03 m` | no part of the arm near the table |
| gripper tip not behind the base | `tip x >= -0.10 m` | keeps the hand away from the cables and the person standing behind the arm |

The lab's choreographer applies the first two rules (constants `MIN_TIP_Z = 0.08`, `MIN_LINK_Z = 0.03`). The public playground applies the third. The reference simulator and validator check all three and report them as **geometry** results, separate from the lab validator's `ok`. A playable that breaks a geometry rule may be refused at the lab even when the joint-space validator says OK.

How close are you likely to get? From ready the tip is 0.43 m high. The examples in section 17 never go below 0.21 m (the bow) or 0.29 m (the others), and the lowest link is always the shoulder at 0.1135 m. You have to lean the arm far forward and pitch the hand down hard (for example `[0, 1.5, 0.5, -1.2, 0, 0]`, tip z 0.034 m) to break the rules.

### 11.2 What is not modelled

- **Self-collision.** There is no collision model. Strongly folding the elbow (j3 near its soft limits) while pitching the wrist (j4 large) can make the hand meet the upper arm. Stay in the comfortable ranges of [5.1](#51-limits-table).
- **Cables.** Keep j1 within ±1.0 rad and j6 within ±1.2 rad, and do not spin j6 back and forth by large amounts many times.
- **People and objects.** The lab clears the workspace and a person watches every run with a hand on the stop.

### 11.3 Safety culture

The validator is a filter, not a guarantee. Design motions that a cautious person would be happy to run next to a crowd: modest amplitudes, smooth eases, no surprises, start and end at ready.

---

## 12. Motion design guide

### 12.1 How each joint moves the tip

Measured with the FK of section 10, starting from ready `[0, 0.5, 0.8, 0, 0, 0]` (tip at (0.205, 0, 0.432) m), moving one joint by ±0.3 rad. Millimetres, base frame (x forward, y left, z up):

| joint | Δq | Δx (forward) | Δy (left) | Δz (up) | in words |
|---|---|---|---|---|---|
| j1 | +0.3 | -9 | +61 | 0 | tip swings to the arm's left |
| j1 | -0.3 | -9 | -61 | 0 | tip swings to the arm's right |
| j2 | +0.3 | +86 | 0 | **-69** | forward and **down** (lean in, bow) |
| j2 | -0.3 | -102 | 0 | +40 | back and up (lean back) |
| j3 | +0.3 | -75 | 0 | **+115** | **up** and back (stand tall) |
| j3 | -0.3 | +38 | 0 | -132 | down and a bit forward (crouch) |
| j4 | +0.3 | -27 | 0 | +56 | hand tilts **up** (chin up) |
| j4 | -0.3 | +9 | 0 | -62 | hand tilts **down** (nod down, look at the table) |
| j5 | +0.3 | -6 | -40 | -2 | hand turns to the arm's right |
| j5 | -0.3 | -6 | +40 | -2 | hand turns to the arm's left |
| j6 | ±0.3 | 0 | 0 | 0 | gripper rolls in place (twist, "wave" of the hand) |

Rules of thumb:

- **To lower the hand** (bow, reach toward the table): increase j2, tilt j4 negative.
- **To raise the hand** (stand tall, reach up): increase j3, keep j2 modest, tilt j4 slightly negative to keep the hand level.
- **Increasing j2 and j3 together** mostly lifts the tip up and slightly forward (the "up" pose `[0, 0.85, 1.2, -0.2, 0, 0]` is 5 cm higher and 6 cm further forward than ready). It does *not* bow.
- **Side to side**: j1 (whole arm) for big moves, j5 (hand only) for small ones. j1 and j5 with opposite signs keep the hand pointing forward while the arm sways.
- **Expressive and cheap**: j4, j5, j6 move the hand a lot visually with small angles and little mass. j1, j2, j3 move the whole arm and need longer segments.

### 12.2 A vocabulary of gestures

Offsets are added to ready. Durations are minimums at the default caps; use more.

| Gesture | Keyframes (q) | Timing | Notes |
|---|---|---|---|
| **nod yes** | ready, then alternate j4 = 0.05 and j4 = 0.3 (with j2 0.55, j3 0.9) | ≥ 1.3 s per half-nod | example `nod` |
| **shake no** | alternate j5 = +0.15 and -0.15 | ≥ 1.5 s per swing (0.3 rad) | add j1 ±0.08 for a fuller head shake |
| **wave hello** | raise hand `[0, 0.7, 1.1, -0.3, 0, 0]`, then alternate j1 ±0.08 with j6 ±0.12 | ≥ 1.2 s per swing | example `wave` |
| **bow** | `[0, 1.1, 0.9, -0.6, 0, 0]`, hold, back | ≥ 3.0 s down (j2 and j4 move 0.6 rad) | example `bow`; tip goes forward 9 cm and down 22 cm |
| **look around** | j1 ±0.5 with j5 ±0.15, then peek down (j4 -0.3) | ≥ 2.5 s per 0.5 rad turn, 5 s for a full left-to-right | example `look-around` |
| **stretch / reach up** | `[0, 0.6, 1.5, -0.3, 0, 0]` | ≥ 3.5 s up (j3 moves 0.7 rad) | tip rises to 0.61 m |
| **shrug** | `[0, 0.4, 1.0, -0.15, 0, 0]` and back | ≥ 1.1 s | j2 back, j3 up a little |
| **pump (energy)** | ready ↔ up `[0, 0.85, 1.2, -0.2, 0, 0]` | ≥ 2.0 s each way (default), ≥ 1.2 s (dance) | used in `beat-dance` |
| **sway (groove)** | j1 ±0.25 with j6 ∓0.25 | ≥ 2.5 s side to side (0.5 rad) at default caps, 1.25 s at dance caps | counter-roll keeps it playful |
| **celebrate** | pump + open/close gripper on the beats | | gripper not played on the real arm yet |
| **think / tilt head** | j5 0.2, j4 -0.15, hold 1 to 2 s | ≥ 1.1 s | hold sells it |

### 12.3 The bow, done right

An earlier language-model attempt at "take a graceful bow" raised j2 and j3 together and pitched j4 up: the tip went *up and back*, the opposite of a bow. The real bow leans the shoulder forward (j2 up) and pitches the hand down (j4 negative), with j3 nearly unchanged:

```
ready  [0, 0.5, 0.8,  0,   0, 0]   tip (0.205, 0, 0.432)   hand points forward, slightly up
bow    [0, 1.1, 0.9, -0.6, 0, 0]   tip (0.298, 0, 0.209)   hand points forward-down at 45 degrees
```

j2 and j4 each move 0.6 rad, so the bow needs at least 1.5 × 0.6 / 0.3 = 3.0 s down at the default caps (the example uses 3.4 s), a 1.6 s hold, and 3.4 s back up. For a deeper bow add a little more j2 (up to 1.3) and j4 (down to -0.8); check the tip stays above 0.08 m.

### 12.4 Structuring a piece

- **Start and end at ready.** Put ready as keyframe 0 (t = 0) and as the last keyframe. Then there is no automatic transition and the piece loops cleanly.
- **Phrases of 2 to 4 moves**, separated by short holds (0.3 to 1 s). Holds are free (they cost no speed) and make motion readable.
- **Contrast** big and small, slow and quick, left and right. Mirror a phrase (negate j1, j5, j6) for the answer.
- **Do not move every joint in every segment.** Two or three joints per move reads better and is easier to keep under the caps.
- **Keep 0.2 rad away from soft limits**; the path overshoots nothing (cubic eases never overshoot), but the real arm sags and tracks with some error.

### 12.5 Sizing moves to a beat

At `bpm` beats per minute one beat lasts `60 / bpm` seconds. For a cubic move lasting `T = n_beats × 60 / bpm`, the largest move per joint that respects the caps with a 10% margin is

```
d_max(T) = min( 0.9 * vel_cap * T / 1.5,  0.9 * acc_cap * T² / 6 )
```

| caps | BPM | beat (s) | max d, 1-beat move (rad) | 2-beat move | 4-beat move |
|---|---|---|---|---|---|
| default | 60 | 1.000 | 0.15 | 0.36 | 0.72 |
| default | 80 | 0.750 | 0.08 | 0.27 | 0.54 |
| default | 90 | 0.667 | 0.07 | 0.24 | 0.48 |
| default | 100 | 0.600 | 0.05 | 0.22 | 0.43 |
| default | 120 | 0.500 | 0.04 | 0.15 | 0.36 |
| default | 140 | 0.429 | 0.03 | 0.11 | 0.31 |
| dance | 60 | 1.000 | 0.30 | 0.72 | 1.44 |
| dance | 80 | 0.750 | 0.17 | 0.54 | 1.08 |
| dance | 90 | 0.667 | 0.13 | 0.48 | 0.96 |
| dance | 100 | 0.600 | 0.11 | 0.43 | 0.86 |
| dance | 120 | 0.500 | 0.07 | 0.30 | 0.72 |
| dance | 140 | 0.429 | 0.06 | 0.22 | 0.62 |

So at typical pop tempos, one-beat moves are tiny (a wrist flick). Move on every **second** beat (or every bar) and let small wrist accents mark the other beats. A fast song gets smaller moves, never faster ones. Each cubic move stops on its beat, which reads as "hitting" the beat.

### 12.6 Syncing to music

1. **Get the beat grid.** Ask for the BPM, or better the list of beat times (any beat tracker gives them, for example librosa). For a steady tempo, beat k is at `t_k = t_first + k × 60 / bpm`.
2. **Pick an excerpt** of at most about 55 s (the playable limit is 60 s), starting on a downbeat (the "1" of a bar; in 4/4 music every 4th beat). Put that downbeat at `t = 0` and make keyframe 0 ready.
3. **Place keyframes on beats**, measured from the excerpt start: `t = t_k - t_first`. Round to 3 decimals. Use the real beat times when the tempo drifts.
4. **Map sections to motion**: quiet intro → nods or breathing; verse → sways; chorus → pumps and sweeps; break → a frozen pose (`hold`); outro → back to ready on the last downbeat.
5. **Use `"caps": "dance"`** for beat-synced dances; the lab has run several at these caps.
6. **Write down the music** in the optional `music` object so the lab can line it up:

```json
{"music": {"title": "Song title", "artist": "Artist", "bpm": 100, "offset_s": 42.0, "beats_per_bar": 4}}
```

`offset_s` is the time in the song (seconds) that corresponds to `t = 0`. At the lab, the audio starts together with the trajectory; the lab's player spends 1.0 s blending from the measured pose to keyframe 0 and pads the audio with 1.0 s of silence, so beat 0 meets keyframe 0. You do not need to add that second yourself.

The lab's own choreographer uses this motif library (offsets from ready at amplitude 1.0; each motif is a cycle of poses visited one per step, the last step always returns to ready):

| motif | beats per step (slow tempos) | poses (offsets) | use |
|---|---|---|---|
| hold | 4 | (stay at ready) | rests, silence |
| nod | 1 | j4 +0.2, then 0 | count-ins, quiet parts |
| bounce | 1 | j2 +0.08 j3 +0.12, then 0 | fast, light |
| sway | 2 | (j1 +0.25, j6 -0.25), (j1 -0.25, j6 +0.25) | groove |
| pump | 2 | (j2 +0.35, j3 +0.4, j4 -0.2), then 0 | energy, chorus |
| sweep | 4 | (j1 +0.9, j5 +0.4), (j1 -0.9, j5 -0.4) | builds, long notes |
| wrist-roll | 2 | (j6 +0.3, j4 +0.06), (j6 -0.3, j4 +0.06) | on the beat |
| wrist-wave | 2 | (j5 +0.35, j4 -0.1), (j5 -0.35, j4 -0.1) | playful |
| up-side | 2 | pump + (j1 +0.2, j6 +0.2), pump + (j1 -0.2, j6 -0.2) | high energy |
| hit | 2 | A = (j1 +0.2, j4 -0.2, j6 +0.35), B = mirror; A, B, hold, back | accents on downbeats |
| freeze | 2 | (j2 +0.12, j3 +0.2, j4 -0.25, j6 +0.4), hold, back | breaks, stops |
| breathe | 4 | (j2 +0.12, j3 +0.2, j4 -0.1), then 0 | chill intros/outros |

"Mirror" negates j1, j5 and j6. An `amplitude` between 0 and 1.5 scales the offsets; the choreographer then caps every move to `d_max(T)` from 12.5 for its real beat duration, and doubles the beats per step at fast tempos until a step lasts long enough.

### 12.7 Checklist before you validate

- [ ] keyframe 0 is ready at t = 0, the last keyframe is ready
- [ ] every segment's largest joint change fits the table in 6.3 (with margin)
- [ ] every `hold` repeats the previous q (and grip)
- [ ] all joints inside the comfortable ranges of 5.1
- [ ] bows lower the tip (+j2, -j4), reaches raise it (+j3)
- [ ] total under 60 s (aim for 6 to 20 s, dances up to 55 s)

---

## 13. Build a simulator

### 13.1 What it does

The reference simulator is one HTML file with no build step. It:

- loads a playable from the text box, from a `.json` file, or from a `#p=` link fragment,
- runs the exact validator of section 9 and the geometry rules of section 11, and lists every violation,
- draws a procedural arm from the FK of section 10 (cylinders between joint origins, a box hand with two fingers, an orange dot at the gripper tip, the tip path as a blue line, the 0.08 m safety height as a faint disc),
- plays the motion in real time with the interpolation of section 8, with pause and a scrub bar, and shows the current q, tip position and tip height,
- exports the JSON file and the offline link of section 15 with its QR code.

It uses three libraries from cdnjs, pinned to exact versions: three.js r128 (`three.min.js`, global `THREE`), pako 2.1.0 (zlib), and qrcode-generator 1.4.4. Everything else is in the file.

It was tested in headless Firefox: it loads, animates, draws the arm, opens `#p=` links, makes QR codes, and its validator agrees with the lab's Python validator on all 89 test cases (the 8 examples, speed variants, and invalid mutations covering every violation kind), including `duration`, `max_vel`, `max_acc` and the transition. Its FK matches pinocchio to 1e-14 m.

### 13.2 How to run it

1. Save the listing below as `openyam-simulator.html` (or download https://nhajela.github.io/openyam-playground/reference-simulator.html).
2. Open it in a browser (double-click works; it needs internet once to load the three libraries from cdnjs).
3. Paste a playable into the box and press **Load JSON from box**, or choose a file.
4. Read the validation result. Fix and reload until it says **OK**.
5. Press **Make offline link + QR** and **Download JSON**.

If you are an AI assistant that can run code: write this file, open it with a headless browser if you have one, and call `window.openyam.validate(playable)` and `window.openyam.load(playable)` from a script. If you can only produce files, give the person this file and tell them to open it.

### 13.3 Structure (if you write your own)

1. Constants (5, 6) → 2. parser (9.5) → 3. timeline/eases/sampling (8) → 4. validator (9) → 5. FK (10) and geometry (11) → 6. link codec (15) → 7. scene → 8. UI. The `window.openyam` object exposes `validate`, `sample`, `fk`, `geometry`, `encodeLink`, `decodeLink`, `load`, `parse`, `timeline` and `evalAt` for scripting and tests.

To check your own simulator, compare it with the self-test tables: interpolation (8.10), FK (10.4), validator results (9.13).

### 13.4 The complete listing

```html
{{FILE:reference-simulator.html}}
```

---

## 14. Reference validator in Python

For people (and AIs) without a browser: a single Python file, standard library only, Python 3.8 or newer. It implements sections 8, 9, 10, 11 and 15 and agrees with the lab's validator on all 89 test cases. Download: https://nhajela.github.io/openyam-playground/reference-validator.py

```
python3 reference-validator.py my-dance.json            # validate + geometry
python3 reference-validator.py my-dance.json --link     # also print the offline link
python3 reference-validator.py --decode '<link>'        # show what a link contains
```

Exit code 0 means valid and geometry OK.

```python
{{FILE:reference-validator.py}}
```

---

## 15. Exporting and delivering

### 15.1 JSON file

The simplest delivery: the playable as a pretty-printed `.json` file named `<name>.json`, UTF-8. Send it to the lab, or open it in the viewer.

### 15.2 Offline link format

The offline link carries the whole playable inside the URL fragment (the part after `#`). It never touches a server: browsers do not send fragments, so the viewer and the lab decode it locally.

```
https://nhajela.github.io/openyam-playground/viewer.html#p=<data>

<data> = base64url( zlib( utf8( JSON(envelope) ) ) )
envelope = {"v": 1, "prompt": "<optional request text>", "playable": { ...the playable... }}
```

Exactly:

1. **Envelope.** A JSON object with `"v": 1` (the envelope version, an integer; not the playable version), an optional string `"prompt"`, and `"playable"`: the complete playable object. Keep `format`, `version`, `name` and `caps` in it. Writers SHOULD serialise compactly (no spaces); readers MUST accept any JSON.
2. **UTF-8.** Encode the JSON text as UTF-8 bytes.
3. **zlib.** Compress with zlib, RFC 1950: a 2-byte zlib header (typically `78 da` at level 9), a raw DEFLATE stream (RFC 1951), and the Adler-32 checksum. Level 9 is recommended. This is what Python's `zlib.compress`, pako's `deflate`, fflate's `zlibSync` and the browser's `CompressionStream("deflate")` produce. It is **not** raw DEFLATE (`deflate-raw`) and **not** gzip. Different compressors produce different bytes for the same input; any valid zlib stream is fine.
4. **base64url.** RFC 4648 section 5 alphabet (`A-Z a-z 0-9 - _`), **no `=` padding**.
5. **URL.** `https://nhajela.github.io/openyam-playground/viewer.html#p=` followed by the data.

Readers MUST accept the data after `#p=`, and SHOULD also accept a bare `#<data>` fragment and the playground's older `/p/local#<data>` links (same encoding, same envelope). Readers MUST check that the decoded envelope has `v == 1` and an object `playable`, MUST refuse fragments longer than 20,000 characters or containing characters outside the base64url alphabet, and then validate the playable as usual. A decoded link is untrusted input like any other playable.

### 15.3 Worked example

The `hello` example, serialised compactly into an envelope without a prompt:

```json
{{HELLO_ENV}}
```

That is {{HELLO_ENV_LEN}} bytes of JSON. zlib level 9 (Python `zlib.compress(data, 9)`) gives {{HELLO_Z_LEN}} bytes starting with `78 da`, and the link is ({{HELLO_LINK_LEN}} characters):

```
{{HELLO_LINK}}
```

Decode it with either snippet below and you get the envelope back.

### 15.4 Reference decoders and encoders

Python (standard library):

```python
import base64, json, zlib

def encode_link(playable, prompt=None,
                base="https://nhajela.github.io/openyam-playground/viewer.html"):
    env = {"v": 1, **({"prompt": prompt} if prompt else {}), "playable": playable}
    raw = json.dumps(env, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base + "#p=" + base64.urlsafe_b64encode(zlib.compress(raw, 9)).decode().rstrip("=")

def decode_link(link):
    frag = link.split("#", 1)[1] if "#" in link else link
    if frag.startswith("p="):
        frag = frag[2:]
    env = json.loads(zlib.decompress(base64.urlsafe_b64decode(frag + "=" * (-len(frag) % 4))))
    if not isinstance(env, dict) or env.get("v") != 1 or not isinstance(env.get("playable"), dict):
        raise ValueError("unknown playable link format")
    return env
```

JavaScript in a browser, no library (uses `CompressionStream`, available in current Chrome, Edge, Firefox and Safari):

```js
async function zlibBytes(bytes, mode) {          // mode: "compress" | "decompress"
  const stream = new Blob([bytes]).stream().pipeThrough(
    mode === "compress" ? new CompressionStream("deflate") : new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function toB64Url(u8) {
  let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function encodeLink(playable, prompt) {
  const env = prompt ? { v: 1, prompt, playable } : { v: 1, playable };
  const z = await zlibBytes(new TextEncoder().encode(JSON.stringify(env)), "compress");
  return "https://nhajela.github.io/openyam-playground/viewer.html#p=" + toB64Url(z);
}
async function decodeLink(link) {
  let frag = link.includes("#") ? link.slice(link.indexOf("#") + 1) : link;
  if (frag.startsWith("p=")) frag = frag.slice(2);
  if (!/^[A-Za-z0-9_-]+$/.test(frag) || frag.length > 20000) throw new Error("not a playable link");
  const env = JSON.parse(new TextDecoder().decode(await zlibBytes(fromB64Url(frag), "decompress")));
  if (!env || env.v !== 1 || typeof env.playable !== "object") throw new Error("unknown playable link format");
  return env;
}
```

The reference simulator uses pako instead (`pako.deflate(bytes, {level: 9})` and `pako.inflate(bytes)`), which is synchronous and works in older browsers. Node.js: `zlib.deflateSync(buf, {level: 9})` and `zlib.inflateSync(buf)`; `Buffer.from(x).toString("base64url")` gives unpadded base64url.

### 15.5 QR codes

Encode the **whole link** (not just the data) as a QR code in byte mode with error-correction level **L**. Phones then open the viewer directly, and the lab's scanner reads the same text.

| QR version (size) | max bytes at level L |
|---|---|
| 10 (57 × 57) | 271 |
| 15 (77 × 77) | 520 |
| 20 (97 × 97) | 858 |
| 25 (117 × 117) | 1,273 |
| 30 (137 × 137) | 1,732 |
| 40 (177 × 177) | 2,953 (the absolute maximum) |

The examples in this spec give links of 415 to 690 characters (QR versions 14 to 18), which scan easily from a phone screen.

- **Target:** link ≤ 1,000 characters. Up to about 1,300 still scans well from a screen at full brightness.
- **Hard limit:** 2,953 characters. Longer links cannot be a single QR code.
- **If the link is too long**, shrink the playable, in this order:
  1. Drop `notes`, `prompt`, `author`, `created`, `music` from the link (keep them in the JSON file).
  2. Round `q` to 3 decimals and `t` to 2 or 3 decimals.
  3. Omit fields at their defaults: `space` ("joint"), `start` ("ready"), `loop` (1), `speed` (1), `"ease": "cubic"`, and `grip` when it does not change. Never omit `format`, `version`, `name`, or a non-default `caps`.
  4. Use fewer keyframes: merge tiny moves, use `loop` for repeated phrases (remember the loop-closure rule).
  5. Still too long? Deliver the JSON file instead.

The examples here already fit comfortably. A 55 s dance with a keyframe every beat at 120 BPM (about 110 keyframes) comes to roughly 1,500 to 2,600 characters: it may still fit one QR code, but deliver the JSON file as well.

---

## 16. What happens at the lab

1. **Receive.** The lab operator scans your QR code or opens your link or JSON file at the lab station. The playable is decoded locally.
2. **Re-validate.** The lab runs its own validator (the code this spec describes) at the caps your playable declares, plus forward-kinematics checks. Anything that fails is refused with the violation list. Old playables without `format`/`version` are read as 1.0.
3. **Preview.** The operator watches the motion on a simulated arm (a ghost of the real one) before anything moves, and may ask what it is meant to do.
4. **Decide.** A person decides whether to play it. They may refuse for any reason: the workspace is not clear, the motion looks risky, it is too long for the queue, or it is not appropriate. Validation makes a playable eligible, not guaranteed.
5. **Play.** When the operator presses Play: the arm powers up, moves slowly to the `start` pose (ready), blends over 1.0 s from its measured pose to your first keyframe (the real arm sags a few hundredths of a radian), plays the trajectory, and stops. If you brought music and it was prepared, the audio starts with the trajectory. Stop is always one key away and holds position.
6. **After.** The arm returns home and the motors are switched off. The run is logged at the lab.

Current limitations (October 2026):

- **The gripper channel is not played on the real arm yet.** `grip` is validated and shown in previews, but the real gripper stays where it is. Do not make a motion whose meaning depends on the gripper.
- The arm tracks positions with some sag (section 3.4); very small moves (under about 0.05 rad) may be hard to see.
- Only joint-space playables at the `default` and `dance` caps are played.

---

## 17. Examples

Each example is also a file at `https://nhajela.github.io/openyam-playground/examples/<name>.json`. All of them pass the lab validator and the geometry rules. Load any of them in the simulator or the viewer. Expected validator numbers are in [9.13](#913-expected-results-for-the-examples).

{{EXAMPLES}}

---

## 18. FAQ and troubleshooting

### 18.1 Validator errors and fixes

**`velocity` on jN at t = ...**
The segment ending near that time is too short for the change in jN. Use `T >= 1.5 × d / cap` (6.2): for the default caps, 5 s per radian. Either lengthen the segment (increase this and all later `t` by the same amount), or make the move smaller. If it happens only after you raised `speed`, lower `speed`.

**`acceleration` on jN**
Either a `linear` ease (use `cubic`), or a short segment with a sizeable move: `T >= sqrt(6 × d / cap)`. At the default caps a 0.2 rad move needs 1.1 s.

**Fix speed errors automatically.** Stretch only the offending segments: multiply the segment's duration by `value / limit` for velocity or `sqrt(value / limit)` for acceleration, times 1.03, shift all later keyframes, and validate again. (The lab has a tool that does exactly this; it refuses `linear`/`hold` velocity steps because slowing down cannot fix them.)

**`keyframe_out_of_range` / `path_out_of_range`**
A keyframe is outside the soft limits (5.1), or the path between two keyframes is. Cubic and linear eases never overshoot, so a path violation in a joint means one of its keyframes is out too, or it happens during the start transition from `home`. Move the keyframe at least 0.2 rad inside the limit. The most common cause: j2 or j3 below 0.1 (for example a keyframe at `home`).

**`hold_jump`**
A keyframe with `"ease": "hold"` has a different `q` from the previous keyframe. Copy the previous `q` exactly, or change the ease to `cubic`.

**`non_monotonic_t`**
Two keyframes have the same `t`, or a later keyframe has a smaller `t`. Times must strictly increase.

**`schema`: first keyframe must be at t=0**
Make the first keyframe `"t": 0`.

**`schema`: name must match ...**
Use lowercase letters, digits and hyphens: `"happy-wave-2"`, not `"Happy Wave!"`.

**`schema`: loop must be an integer**
Write `"loop": 2`, not `"loop": 2.0` or `"2"`.

**`schema`: unknown caps preset**
Only `"default"` and `"dance"` exist.

**`version`**
Add `"format": "openyam-playable"` and `"version": "1.0"` (a string, not a number).

**`loop_discontinuity`**
With `loop` > 1 the last keyframe must equal the first (0.01 rad). Append a final keyframe that returns to keyframe 0's `q`.

**`too_long`**
Total playback over 60 s. Fewer loops, fewer keyframes, or a higher `speed` (which is shorter, but faster: re-check the caps).

**`grip_velocity`**
The gripper changes faster than 3 strokes per second. Give each full open/close at least 0.5 s with a cubic ease, and do not change grip across a `hold`.

**`envelope_velocity` (or another `envelope_` kind)**
The lab's envelope cross-check (9.10) found something. Most often a `hold` with a tiny jump. Fix as for the matching kind.

**Geometry: tip below 0.08 m / link below 0.03 m**
The hand goes too low. Use less j2, less negative j4, or more j3 at that moment (12.1).

**Geometry: tip behind the base**
j3 too large or j1 turned too far with the hand back. Keep j3 under about 1.6 and the hand forward.

### 18.2 Other questions

**My simulator says OK but my own numbers differ slightly from the lab's.**
Compare `duration`, `max_vel`, `max_acc` with 9.13. A difference usually means a different velocity formula (use `numpy.gradient` semantics, 9.8) or a different sample grid (8.8).

**Can I start somewhere other than ready?**
Only `ready` and `home` exist as start poses. You may make keyframe 0 any valid pose; the validator then prepends a transition (8.6). It is simpler and more predictable to start at ready.

**Can I use the gripper?**
You can write `grip` values and they are validated and previewed, but the real arm does not play them yet (16).

**Why is everything so slow?**
The default caps are deliberately conservative for a public arm in a crowded room. Use `"caps": "dance"` for beat-synced dances. Make it lively with rhythm, holds and contrast.

**How precise is the preview?**
The preview shows the commanded motion exactly. The real arm follows it with a small lag and a few hundredths of a radian of sag.

**What does `speed` do to timing with music?**
It scales all keyframe times. A beat-synced dance must be authored at `speed` 1 with keyframes on the beat times.

**Is `"space": "cartesian"` coming?**
It is reserved. It may be defined in a later 1.x version; until then it is refused.

**Can I put two playables in one link?**
No. One link, one playable.

**Is my link private?**
The fragment after `#` is not sent to the web server, so the motion is not uploaded anywhere by opening the link. Anyone you give the link to can read it.

---

## 19. Compatibility promise

For format version **1.x** (this document and its future 1.x revisions):

1. **The meaning of every field in 1.0 never changes** within 1.x. Interpolation, eases, the start transition, the validation steps, tolerances and limits stay as written.
2. **Limits are not tightened within 1.x.** A playable valid under 1.0 stays valid under every 1.x validator. If the real arm ever needs stricter limits, that is a new major version (2.0), announced here, and the lab says how it treats 1.x playables.
3. **Minor versions only add optional things**: new optional fields, new optional values (for example a new `caps` preset or a new named start pose). A reader that does not know a new *field* ignores it. A reader that does not know a new *value* of an existing field (an unknown preset or pose) refuses the playable, which is the safe failure.
4. **Readers MUST ignore unknown fields** and MUST refuse a different major version.
5. **The lab accepts any 1.x** playable and validates it with the newest 1.x rules it knows.
6. **Legacy playables** (no `format`/`version`) are read as 1.0 for as long as 1.x lasts.
7. **The offline link envelope** (`"v": 1`, zlib, base64url, `#p=`) is stable for 1.x. A new envelope would use `"v": 2` and the reader would refuse it if unknown.
8. **This document** uses semantic versioning on its own: patch releases (1.0.1) fix wording, typos and examples without changing behaviour; minor releases (1.1.0) document a new minor format version; a major release (2.0.0) documents format 2.0. `spec/v1.md` always holds the newest 1.x text; `spec/latest.md` the newest text of the newest major (today the two are identical). Earlier texts stay in the repository history.

If this document and the lab's code ever disagree, the lab's code is what runs; the document is corrected in a patch release and the difference is listed in the changelog.

---

## 20. Changelog

### 1.0.0 (2026-10-16)

- First public release.
- Format `openyam-playable` version `1.0`: joint-space keyframes, eases `cubic`/`linear`/`hold`, gripper, loops, speed, start poses `ready`/`home` with the automatic start transition, cap presets `default` and `dance`.
- Validation algorithm with the lab's exact tolerances, including the envelope cross-check.
- Forward kinematics from the i2rt YAM URDF (kinematic parameters only), reference poses, geometry rules (tip z ≥ 0.08 m, links z ≥ 0.03 m, tip x ≥ -0.10 m).
- Offline link `viewer.html#p=<base64url(zlib(JSON))>`, same encoding as the OpenYAM playground's `/p/local#` links.
- Reference simulator (HTML) and reference validator (Python), tested against the lab's validator on 89 cases.
- Eight examples: `hello`, `nod`, `wave`, `bow`, `look-around`, `happy-dance`, `beat-dance`, `rom-arm`.
- Compared with the lab's earlier internal format (no `format`/`version`), nothing changes in meaning; such files are read as 1.0.

---

## 21. Appendix: constants in one place

```json
{
  "format": "openyam-playable",
  "version": "1.0",
  "joints": ["j1", "j2", "j3", "j4", "j5", "j6"],
  "hard_limits_rad": {"j1": [-2.618, 3.142], "j2": [0.0, 3.665], "j3": [0.0, 3.142],
                      "j4": [-1.693, 1.571], "j5": [-1.571, 1.571], "j6": [-2.094, 2.094]},
  "soft_margin_rad": 0.1,
  "soft_limits_rad": {"j1": [-2.518, 3.042], "j2": [0.1, 3.565], "j3": [0.1, 3.042],
                      "j4": [-1.593, 1.471], "j5": [-1.471, 1.471], "j6": [-1.994, 1.994]},
  "caps": {"default": {"vel": 0.3, "acc": 1.0}, "dance": {"vel": 0.6, "acc": 2.0}},
  "grip_vel_cap": 3.0,
  "poses": {"home": [0, 0, 0, 0, 0, 0], "ready": [0, 0.5, 0.8, 0, 0, 0]},
  "sample_rate_hz": 100,
  "max_duration_s": 60,
  "start_tol_rad": 0.05,
  "loop_tol_rad": 0.01,
  "hold_tol_rad": 1e-6,
  "limit_eps": 1e-9,
  "speed_range": "(0, 2]",
  "loop_range": [1, 10],
  "transition": "cubic, sized for half the caps, min 0.5 s, + 0.05 s, rounded to 0.01 s",
  "geometry": {"min_tip_z_m": 0.08, "min_link_z_m": 0.03, "min_tip_x_m": -0.10},
  "tip_frame": "gripper_tip = gripper frame + (0, 0, -0.1) m",
  "link_envelope": {"v": 1, "compression": "zlib (RFC 1950)", "encoding": "base64url, no padding",
                    "url": "https://nhajela.github.io/openyam-playground/viewer.html#p=<data>",
                    "max_fragment_chars": 20000},
  "qr": {"mode": "byte", "ecc": "L", "target_chars": 1000, "max_chars": 2953}
}
```
