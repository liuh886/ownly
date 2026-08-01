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
  assetPrefix: basePath || undefined,
};

export default nextConfig;
