import type { Metadata } from "next";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default function MotDePasseOubliePage() {
  return (
    <div className="container-site py-10">
      <div className="mx-auto w-full max-w-md">
        <ResetRequestForm />
      </div>
    </div>
  );
}
