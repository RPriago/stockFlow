import React from 'react';
import Image from 'next/image';

interface AuthHeroProps {
  title?: string;
  subtitle?: string;
}

export default function AuthHero({
  title = 'Real-Time Precision Across Every Facility',
  subtitle = 'Empower your warehouse workforce with automated tracking, intelligent workflows, and instant visibility.',
}: AuthHeroProps) {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative min-h-screen overflow-hidden bg-slate-950 select-none">
      {/* Background Image */}
      <Image
        src="/warehouse-auth-bg.jpg"
        alt="Warehouse Logistics and Forklift"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover object-center"
      />

      {/* Dark Ambient Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06191A]/95 via-[#06191A]/50 to-black/20" />

      {/* Content Positioned at Bottom */}
      <div className="relative z-10 flex flex-col justify-end p-12 xl:p-16 text-white w-full">
        <h2 className="text-2xl xl:text-3xl font-bold tracking-tight text-white leading-snug max-w-lg">
          {title}
        </h2>
        <p className="mt-3 text-sm xl:text-base text-slate-200/90 leading-relaxed font-normal max-w-lg">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

