"use client";

import Hero from "@/components/Hero";
import AnnouncementsSection from "@/components/AnnouncementsSection";
import SpecsSection from "@/components/SpecsSection";
import HelpSteps from "@/components/HelpSteps";
import FeaturesSection from "@/components/FeaturesSection";
import GalleryCarousel from "@/components/GalleryCarousel";
import TeamCarousel from "@/components/TeamCarousel";
import ContactForm from "@/components/ContactForm";
import CommunitySection from "@/components/CommunitySection";

/** 模板一 · 经典：独立主题文件，切换主题时整体挂载 / 卸载 */
export default function HomeThemeV1() {
  return (
    <>
      <Hero />
      <AnnouncementsSection />
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
