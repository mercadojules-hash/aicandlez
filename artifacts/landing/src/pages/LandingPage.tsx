import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { AppPreview } from "@/components/landing/AppPreview";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Pricing } from "@/components/landing/Pricing";
import { Trust } from "@/components/landing/Trust";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

export function LandingPage() {
  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      <Navbar />
      <Hero />
      <AppPreview />
      <HowItWorks />
      <Features />
      <Pricing />
      <Trust />
      <CTA />
      <Footer />
    </div>
  );
}
