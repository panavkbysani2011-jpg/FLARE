import React from 'react';
import { ThemeMode } from '../types/psi';

export interface FlareLogoProps {
  theme?: ThemeMode;
  variant?: 'auto' | 'dark' | 'light';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  alt?: string;
}

const SIZE_CLASSES: Record<NonNullable<FlareLogoProps['size']>, string> = {
  xs: 'w-5 h-5',
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
};

export const FlareLogo: React.FC<FlareLogoProps> = ({
  theme = 'normal',
  variant = 'auto',
  size = 'sm',
  className = '',
  alt = 'FLARE Orbital Flame Core logo',
}) => {
  const isDarkSurface =
    variant === 'dark' || (variant === 'auto' && theme === 'dark');
  const src = isDarkSurface
    ? '/images/flare-logo-dark.png'
    : '/images/flare-logo-light.png';

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-lg overflow-hidden shrink-0 border flex items-center justify-center ${
        isDarkSurface
          ? 'bg-[#09090B] border-[#27272A]'
          : 'bg-white border-[#E4E4E7]'
      } ${className}`}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain select-none"
        draggable={false}
      />
    </div>
  );
};
