import json, sys, zlib, base64, importlib.util
from pathlib import Path
sys.path.insert(0, "/home/naman/openyam-robot-arm")
import armctl.playable as P
SP = Path(sys.argv[1]); SITE = Path("/home/naman/openyam-playground/site")
spec = importlib.util.spec_from_file_location("ref", SITE / "reference-validator.py"); ref = importlib.util.module_from_spec(spec); spec.loader.exec_module(ref)
ORDER = ["hello", "nod", "wave", "bow", "look-around", "happy-dance", "beat-dance", "rom-arm"]
EXPL = {
 "hello": ("The smallest useful playable", "Four keyframes: ready, hand tilted up with the gripper open, a `hold`, back to ready. Shows the required fields, a `hold` that repeats the previous `q`, the gripper default (0) and carry-over (keyframe 2 has no `grip`, so it stays 1)."),
 "nod": ("Nod yes three times", "Shoulder and elbow lift slightly (j2 0.55, j3 0.9) so the hand is clear, then j4 alternates between 0.05 and 0.3 every 1.35 s. Each half-nod moves j4 by 0.25 rad: 1.5 × 0.25 / 1.35 = 0.28 rad/s, just under the 0.3 cap. This is about as fast as a default-caps nod can be."),
 "wave": ("Wave hello", "Raise the hand to the wave pose `[0, 0.7, 1.1, -0.3, 0, 0]` in 1.65 s, then swings that combine a small base sway (j1 ±0.08) with a wrist roll (j6 ±0.12) in the same direction (a half swing out in 0.95 s, five full swings of 1.3 s, a half swing back), then lower the hand and return. Combining two joints makes a small, fast-looking wave out of slow joints."),
 "bow": ("A real bow", "The bow from 12.3: j2 +0.6 (lean forward) and j4 -0.6 (hand down) together in 3.4 s, a 1.6 s hold, and 3.4 s back. The tip goes from (0.205, 0, 0.432) to (0.298, 0, 0.209): forward and down, as a bow should."),
 "look-around": ("Look around the room", "Rise a little, turn left with the base and wrist yaw together (j1 0.5, j5 0.15), hold, peek down (j4 -0.3), hold, sweep across to the right in 5.4 s, peek again, come back to the centre and to ready. Holds between moves make each look readable."),
 "happy-dance": ("A happy little dance", "Sways the base and wrist from side to side with a small bounce of shoulder and elbow and gripper snaps. Default caps; the gripper speed (max 1.06 strokes/s) is well under its cap. On the real arm the gripper does not move yet."),
 "beat-dance": ("Beat dance at 100 BPM (dance caps)", "52 beats at 100 BPM (one beat = 0.6 s), with every keyframe on a beat: count-in nods (1-beat moves of 0.1 rad on j4), sways with counter-roll (2 beats each), pumps between ready and up, a big sweep j1 ±0.9 over 8 beats, wrist rolls, and an up-left/up-right combo. Uses `\"caps\": \"dance\"`: peak values reach 0.56 rad/s and 1.98 rad/s², under the 0.6 and 2.0 caps. At the default caps it would fail on almost every joint. It was played on the real arm with music."),
 "rom-arm": ("Range-of-motion tour (dance caps)", "Base to +1.0 and -1.0 rad, then shoulder and elbow up tall and a forward stretch, then back. Used at the lab to show how far the arm moves. The tip stays above 0.29 m and at least 0.11 m in front of the base. A good template for long, smooth moves: each big move takes several seconds even at the dance caps."),
}
res_rows = ["| example | caps | duration (s) | max_vel j1..j6 (rad/s) | max_acc j1..j6 (rad/s²) | max_grip_vel | min tip z (m) |", "|---|---|---|---|---|---|---|"]
ex_md = []
for i, n in enumerate(ORDER, 1):
    txt = (SITE / "examples" / f"{n}.json").read_text()
    p = json.loads(txt)
    r = P.validate(p); assert r["ok"], n
    g = ref.geometry(p); assert g["ok"], n
    res_rows.append(f"| `{n}` | {p.get('caps', 'default')} | {r['duration']} | {r['max_vel']} | {r['max_acc']} | {r['max_grip_vel']} | {g['min_tip_z']} |")
    title, expl = EXPL[n]
    link = ref.encode_link(p)
    ex_md.append(f"### 17.{i} `{n}`: {title}\n\n{expl}\n\nValidator: OK, {r['duration']} s at the `{p.get('caps', 'default')}` caps; lowest tip height {g['min_tip_z']} m; offline link {len(link)} characters. File: `examples/{n}.json`.\n\n```json\n{txt.rstrip()}\n```\n")
hello = json.loads((SITE / "examples/hello.json").read_text())
env = json.dumps({"v": 1, "playable": hello}, separators=(",", ":"), ensure_ascii=False)
z = zlib.compress(env.encode(), 9)
link = ref.encode_link(hello)
assert ref.decode_link(link) == {"v": 1, "playable": hello}
assert z[:2].hex() == "78da"
doc = (SP / "spec_part1.md").read_text() + (SP / "spec_part2.md").read_text()
subs = {"{{RESULTS_TABLE}}": "\n".join(res_rows), "{{EXAMPLES}}": "\n".join(ex_md),
        "{{HELLO_ENV}}": env, "{{HELLO_ENV_LEN}}": str(len(env.encode())), "{{HELLO_Z_LEN}}": str(len(z)),
        "{{HELLO_LINK}}": link, "{{HELLO_LINK_LEN}}": str(len(link)),
        "{{FILE:reference-simulator.html}}": (SITE / "reference-simulator.html").read_text().rstrip(),
        "{{FILE:reference-validator.py}}": (SITE / "reference-validator.py").read_text().rstrip()}
for k, v in subs.items():
    assert k in doc, k
    doc = doc.replace(k, v)
assert "{{" not in doc
(SITE / "spec" / "v1.md").write_text(doc)
(SITE / "spec" / "latest.md").write_text(doc)
print(len(doc.splitlines()), "lines", len(doc), "chars")
