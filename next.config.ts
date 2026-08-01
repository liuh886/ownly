import type { NextConfig } from "next";

const configuredBasePath = process.env.OWNLY_BASE_PATH?.trim() ?? "";
const basePath =
  configuredBasePath === "" || configuredBasePath === "/"
    ? ""
    : `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: {
    NEXT_PUBLIC_OWNLY_BASE_PATH: basePath,
  },
};

export default nextConfig;
