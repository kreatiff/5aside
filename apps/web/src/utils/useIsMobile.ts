import { useState, useEffect } from "react";

/**
 * Hook to detect if the screen is mobile sized (typically < 768px for Lucide/UI patterns)
 * @returns {boolean} Whether the screen is mobile or not
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // 768px is the common md breakpoint
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    checkMobile();

    // Event listener for resize
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}
