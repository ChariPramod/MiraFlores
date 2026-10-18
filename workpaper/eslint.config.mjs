import { dirname } from "path";
import { fileURLToPath } from "url";
import nextVitals from "eslint-config-next/core-web-vitals";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextVitals,
  {
    ignores: [".next/**", "node_modules/**", "data/**", "out/**"],
  },
];

export default eslintConfig;
