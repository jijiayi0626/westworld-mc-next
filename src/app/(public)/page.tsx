import Hero from "@/components/Hero";
import SpecsSection from "@/components/SpecsSection";
import HelpSteps from "@/components/HelpSteps";
import FeaturesSection from "@/components/FeaturesSection";
import GalleryCarousel from "@/components/GalleryCarousel";
import TeamCarousel from "@/components/TeamCarousel";
import ContactForm from "@/components/ContactForm";
import CommunitySection from "@/components/CommunitySection";

export default function HomePage() {
  return (
    <>
      <Hero />
      <SpecsSection />
      <HelpSteps />
      <FeaturesSection />
      <GalleryCarousel />
      <TeamCarousel />
      <ContactForm />
      <CommunitySection />
    </>
  );
}