import type { Metadata } from "next";
import { InscriptionForm } from "./inscription-form";

export const metadata: Metadata = {
  title: "Inscription",
  robots: { index: false, follow: false },
};

export default function InscriptionPage() {
  return (
    <div className="container-site py-10">
      <div className="mx-auto w-full max-w-md">
        <InscriptionForm />
      </div>
    </div>
  );
}
