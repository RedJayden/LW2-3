import { useCallback, useMemo } from "react";
import Particles from "react-tsparticles";
import type { Engine, ISourceOptions } from "tsparticles-engine";
import { loadSlim } from "tsparticles-slim";

interface ParticlesBackgroundProps {
  id?: string;
  className?: string;
}

export function ParticlesBackground({ id = "tsparticles", className }: ParticlesBackgroundProps) {
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine);
  }, []);

  const options: ISourceOptions = useMemo(
    () => ({
      fullScreen: { enable: false },
      background: { color: { value: "transparent" } },
      particles: {
        number: { value: 80, density: { enable: true, area: 800 } },
        color: { value: "#ffffff" },
        shape: { type: "circle" },
        opacity: { value: 0.5, random: true },
        size: { value: 1.5, random: true },
        links: {
          enable: true,
          distance: 250,
          color: "#ffffff",
          opacity: 0.4,
          width: 1,
        },
        move: {
          enable: true,
          speed: 2,
          direction: "none",
          outModes: { default: "out" },
        },
      },
      interactivity: {
        events: { onHover: { enable: true, mode: "grab" } },
        modes: { grab: { distance: 140, links: { opacity: 1 } } },
      },
      detectRetina: true,
    }),
    []
  );

  return (
    <Particles
      id={id}
      init={particlesInit}
      options={options}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
