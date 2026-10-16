import re, json, glob, os
os.chdir("/home/naman/openyam-playground/site")
s = open("spec/v1.md").read()
F = "`" * 3
html = re.search(F + r"html\n(.*?)\n" + F, s, re.S).group(1)
py = re.search(r"## 14\..*?" + F + r"python\n(.*?)\n" + F, s, re.S).group(1)
print("html listing == file:", html == open("reference-simulator.html").read().rstrip())
print("py listing == file:", py == open("reference-validator.py").read().rstrip())
blocks = re.findall(F + r"json\n(.*?)\n" + F, s, re.S)
names = {}
for b in blocks:
    try: d = json.loads(b)
    except Exception as e: print("non-JSON json block:", b[:50].replace("\n", " "), "|", e); continue
    if isinstance(d, dict) and "keyframes" in d: names[d["name"]] = d
for f in sorted(glob.glob("examples/*.json")):
    d = json.load(open(f)); print(f, "embedded identical:", names.get(d["name"]) == d)
