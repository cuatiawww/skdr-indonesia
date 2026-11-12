/**
 * SATUSEHAT / TTDK Design System Integration Module
 * Developed for Digital Transformation Office (DTO) Kemenkes RI
 *
 * Provides strongly-typed tokens, color scales, typography standards,
 * and reusable styling helpers for all SKDR Indonesia components.
 */

export const SATUSEHAT_TOKENS = {
  // Brand Green (Primary SATUSEHAT Identity)
  brand: {
    50: '#F0FCFB',
    100: '#E1FBFA',
    200: '#B8EDEA',
    300: '#80DCD8',
    400: '#20D6CD',
    500: '#16B3AC', // Brand Default
    600: '#128F8A', // Brand Strong (Hover)
    700: '#0D6B67', // Brand Dark (Active/Header)
    800: '#094845',
    900: '#062F2D',
  },
  // Brand Blue (Secondary / Interactive Accent)
  blue: {
    50: '#FAFCFF',
    100: '#EBF3FF',
    200: '#CEE6FE',
    300: '#98CAFE',
    400: '#60ADFE',
    500: '#3899FE', // Blue Default
    600: '#1E81E8', // Blue Strong
    700: '#1968BD',
    800: '#144E8C',
    900: '#0D3255',
  },
  // Neutrals (WCAG AA/AAA compliant text and surfaces)
  neutral: {
    white: '#FFFFFF',
    50: '#F1F2F3', // Page Background
    100: '#E4E5E7', // Stroke Subtle
    200: '#CACCCF', // Stroke Divider
    300: '#B1B5B9',
    400: '#969BA2', // Text Disabled
    500: '#7B828A',
    600: '#62686F', // Text Secondary
    700: '#4A4F53',
    800: '#313336',
    900: '#232323',
    black: '#141313', // Text Primary
  },
  // Feedback & Status Indicators
  status: {
    error: {
      default: '#F02D2D',
      strong: '#D50B0B',
      subtle: '#FFE0E0',
    },
    warning: {
      default: '#FFCC14',
      strong: '#EEBB04',
      subtle: '#FFF8D5',
      coral: '#EC7303',
    },
    success: {
      default: '#3CC14E',
      strong: '#288034',
      subtle: '#E0FAE0',
    },
    info: {
      default: '#0968F6',
      strong: '#0049B8',
      subtle: '#DCEAFE',
    },
  },
  // Categorical Data Palette (for Recharts, Heatmaps, and Epidemic Curves)
  charts: {
    categorical: [
      '#60ADFE', // 01 Indigo/Blue
      '#8770FF', // 02 Violet
      '#FF5C5C', // 03 Red
      '#1BBFCA', // 04 Turquoise
      '#FF6A38', // 05 Orange
      '#FFCC14', // 06 Yellow
      '#0968F6', // 07 Blue
      '#F155A0', // 08 Pink
      '#4CE160', // 09 Green
      '#B56BF0', // 10 Purple
    ],
    // 8-step Epidemiological Risk Gradient (Green -> Lime -> Yellow -> Orange -> Red)
    risk: [
      '#288034', // Risk 01 (Minimal)
      '#3CC14E', // Risk 02
      '#BBED56', // Risk 03 (Low)
      '#FFCC14', // Risk 04 (Moderate)
      '#FF8806', // Risk 05
      '#FF6A38', // Risk 06 (High)
      '#F02D2D', // Risk 07
      '#D50B0B', // Risk 08 (Critical/Outbreak)
    ],
  },
  // Corner Radii
  radii: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    round: '50px',
    full: '9999px',
  },
  // Box Shadows
  shadows: {
    sm: '0px 1px 10px 0px rgba(0, 0, 0, 0.08)',
    md: '0px 1px 15px 0px rgba(0, 0, 0, 0.1)',
    lg: '0px 4px 12px 0px rgba(48, 49, 53, 0.2)',
  },
  // Typography
  typography: {
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
  },
} as const;

/**
 * Helper to convert HEX color to RGB triplet string ("r g b")
 */
export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return '22 179 172';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/**
 * Reusable helper for SATUSEHAT status badge CSS classes
 */
export function getSatusehatBadgeClass(variant: 'success' | 'warning' | 'error' | 'info' | 'brand' | 'neutral'): string {
  switch (variant) {
    case 'success':
      return 'bg-[#E0FAE0] text-[#1B561A] border border-[#A6F0A5]';
    case 'warning':
      return 'bg-[#FFF8D5] text-[#553B06] border border-[#FFE58A]';
    case 'error':
      return 'bg-[#FFE0E0] text-[#570303] border border-[#FFA0A0]';
    case 'info':
      return 'bg-[#DCEAFE] text-[#002A69] border border-[#84B4FB]';
    case 'brand':
      return 'bg-[#E1FBFA] text-[#0D6B67] border border-[#B8EDEA]';
    case 'neutral':
    default:
      return 'bg-[#F1F2F3] text-[#313336] border border-[#E4E5E7]';
  }
}

/**
 * Reusable button styling conforming to TTDK Design System
 */
export function getSatusehatButtonClass(
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' = 'primary',
  size: 'sm' | 'md' | 'lg' = 'md'
): string {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-lg font-medium',
    md: 'px-4 py-2 text-sm rounded-xl font-medium',
    lg: 'px-6 py-2.5 text-base rounded-xl font-semibold',
  }[size];

  const variantClasses = {
    primary:
      'bg-[#16B3AC] text-white hover:bg-[#128F8A] active:bg-[#0D6B67] shadow-sm transition-all duration-150 focus:ring-2 focus:ring-[#16B3AC]/40 focus:outline-none',
    secondary:
      'bg-[#E1FBFA] text-[#0D6B67] hover:bg-[#B8EDEA] active:bg-[#80DCD8] transition-all duration-150 font-medium',
    outline:
      'border border-[#CACCCF] bg-white text-[#141313] hover:bg-[#F1F2F3] active:bg-[#E4E5E7] transition-all duration-150',
    ghost:
      'bg-transparent text-[#62686F] hover:bg-[#F1F2F3] hover:text-[#141313] transition-all duration-150',
    danger:
      'bg-[#F02D2D] text-white hover:bg-[#D50B0B] active:bg-[#570303] shadow-sm transition-all duration-150',
  }[variant];

  return `inline-flex items-center justify-center gap-2 cursor-pointer ${sizeClasses} ${variantClasses}`;
}
