import Image from "next/image";
import styles from "./brand-logo.module.css";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <Image className={compact ? styles.compact : styles.logo} src="/logo/Knectan_logo.svg" alt="Knectan" width={1536} height={1024} unoptimized priority={!compact} />;
}
