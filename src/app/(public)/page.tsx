import Hero from "@/components/Hero";
import AnnouncementsSection from "@/components/AnnouncementsSection";
import SpecsSection from "@/components/SpecsSection";
import HelpSteps from "@/components/HelpSteps";
import FeaturesSection from "@/components/FeaturesSection";
import GalleryCarousel from "@/components/GalleryCarousel";
import TeamCarousel from "@/components/TeamCarousel";
import ContactForm from "@/components/ContactForm";
import CommunitySection from "@/components/CommunitySection";
import HomeV2 from "@/components/front/v2/HomeV2";

/**
 * 首页同时渲染模板一 / 模板二两套结构，
 * 由 <html data-frontend> + CSS 决定展示哪一套，切换无需重新部署（见 front-v2.css）。
 */
export default function HomePage() {
  return (
    <>
      <div className="front-page" data-front="v1">
        <Hero />
        <AnnouncementsSection />
        <SpecsSection />
        <HelpSteps />
        <FeaturesSection />
        <GalleryCarousel />
        <TeamCarousel />
        <ContactForm />
        <CommunitySection />
      </div>

      <div className="front-page" data-front="v2">
        <HomeV2 />
      </div>
    </>
  );
}
