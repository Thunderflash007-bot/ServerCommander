const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["dockerode", "node-pty", "@prisma/client"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "node-pty"];
    }
    return config;
  },
};

export default nextConfig;