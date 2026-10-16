import Generator from "@/components/Generator";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Teach a robot arm a <em>new move</em>.</h1>
        <p>Describe a motion in plain words. An AI choreographs it, we check it fits the arm&apos;s safe range, and you watch it in 3D. Like it? Save it and bring the QR code to the real arm.</p>
      </section>
      <Generator />
    </>
  );
}
