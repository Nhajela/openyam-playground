import SafetyNote from "./SafetyNote";

export default function BringToArm() {
  return (
    <div>
      <h2>Bring this to the arm</h2>
      <ol className="steps">
        <li>Find the OpenYAM arm at the lab.</li>
        <li>Show this QR code (or this page) to the operator.</li>
        <li>They scan it; the arm station downloads your motion and checks it again with the lab&apos;s own validator.</li>
        <li>They preview it, clear the space around the arm, and press Play. Stand an arm&apos;s length back and enjoy.</li>
      </ol>
      <SafetyNote />
    </div>
  );
}
