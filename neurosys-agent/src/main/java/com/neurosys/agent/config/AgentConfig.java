package com.neurosys.agent.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import oshi.SystemInfo;
import oshi.hardware.NetworkIF;

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.List;
import java.util.Properties;
import java.util.UUID;

public class AgentConfig {

    private static final Logger log = LoggerFactory.getLogger(AgentConfig.class);
    private static final Properties properties = new Properties();
    private static String agentId;

    static {
        // 1. Try loading external agent.properties from working directory first
        File externalProps = new File("agent.properties");
        if (externalProps.exists()) {
            try (InputStream input = Files.newInputStream(externalProps.toPath())) {
                properties.load(new java.io.InputStreamReader(input, java.nio.charset.StandardCharsets.UTF_8));
                log.info("Loaded agent.properties from external file: {}", externalProps.getAbsolutePath());
                // Handle possible UTF-8 BOM in key names
                for (String key : properties.stringPropertyNames()) {
                    if (key.contains("server.url")) {
                        properties.setProperty("server.url", properties.getProperty(key));
                    }
                }
            } catch (Exception e) {
                log.warn("Could not load external agent.properties file", e);
            }
        }
        
        // 2. Fallback to classpath agent.properties if not already set
        if (properties.isEmpty()) {
            try (InputStream input = AgentConfig.class.getClassLoader().getResourceAsStream("agent.properties")) {
                if (input != null) {
                    properties.load(input);
                }
            } catch (Exception e) {
                log.error("Failed to load agent.properties from classpath", e);
            }
        }

        // 3. Determine persistent Agent ID (across Windows reboots)
        agentId = resolvePersistentAgentId();
    }

    private static String resolvePersistentAgentId() {
        // Priority 1: Environment variable
        String envId = System.getenv("NEUROSYS_AGENT_ID");
        if (envId != null && !envId.trim().isEmpty()) {
            return envId.trim();
        }

        // Priority 2: System property
        String sysId = System.getProperty("agent.id");
        if (sysId != null && !sysId.trim().isEmpty()) {
            return sysId.trim();
        }

        // Priority 3: Configured in agent.properties
        String propId = properties.getProperty("agent.id");
        if (propId != null && !propId.trim().isEmpty()) {
            return propId.trim();
        }

        // Priority 4: Deterministic hardware ID derived from Hostname + MAC address hash
        String generatedId = generateHardwareBasedId();

        // Priority 5: Persistent file agent_id.txt override if set
        Path idFilePath = Path.of("agent_id.txt");
        if (Files.exists(idFilePath)) {
            try {
                String savedId = Files.readString(idFilePath).trim();
                if (!savedId.isEmpty() && savedId.startsWith("AGENT-")) {
                    log.info("Using configured Agent ID from agent_id.txt: {}", savedId);
                    return savedId;
                }
            } catch (Exception e) {
                log.warn("Could not read agent_id.txt: {}", e.getMessage());
            }
        }

        // Save generated hardware ID to agent_id.txt for transparency
        try {
            Files.writeString(idFilePath, generatedId);
            log.info("Persisted unique hardware Agent ID to agent_id.txt: {}", generatedId);
        } catch (Exception e) {
            log.warn("Could not save agent_id.txt: {}", e.getMessage());
        }

        return generatedId;
    }

    private static String generateHardwareBasedId() {
        try {
            SystemInfo si = new SystemInfo();
            String hostname = si.getOperatingSystem().getNetworkParams().getHostName();
            List<NetworkIF> nifs = si.getHardware().getNetworkIFs();
            String mac = "";
            for (NetworkIF nif : nifs) {
                if (nif.getMacaddr() != null && !nif.getMacaddr().isEmpty() && !nif.getMacaddr().equals("00:00:00:00:00:00")) {
                    mac = nif.getMacaddr();
                    break;
                }
            }

            String rawStr = (hostname + "-" + mac).toLowerCase();
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(rawStr.getBytes());
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 4; i++) {
                sb.append(String.format("%02X", hash[i]));
            }
            return "AGENT-" + sb.toString();
        } catch (Exception e) {
            return "AGENT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        }
    }

    public static String getServerUrl() {
        String url = System.getenv("NEUROSYS_SERVER_URL");
        if (url == null || url.trim().isEmpty()) {
            url = System.getProperty("server.url");
        }
        if (url == null || url.trim().isEmpty()) {
            url = properties.getProperty("server.url", "https://realtimesystem-production.up.railway.app/api/v1");
        }
        url = url.trim();
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        if (!url.endsWith("/api/v1") && !url.endsWith("/api")) {
            url = url + "/api/v1";
        }
        return url;
    }

    public static String getLabName() {
        String envLab = System.getenv("NEUROSYS_LAB_NAME");
        if (envLab != null && !envLab.trim().isEmpty()) {
            return envLab.trim();
        }
        String sysLab = System.getProperty("agent.lab.name");
        if (sysLab != null && !sysLab.trim().isEmpty()) {
            return sysLab.trim();
        }
        return properties.getProperty("agent.lab.name", "General Lab");
    }

    public static int getIntervalSeconds() {
        return Integer.parseInt(properties.getProperty("agent.collection.interval.seconds", "1"));
    }

    public static String getEnrollmentCode() {
        String envCode = System.getenv("NEUROSYS_ENROLLMENT_CODE");
        if (envCode != null && !envCode.trim().isEmpty()) {
            return envCode.trim();
        }
        String sysCode = System.getProperty("agent.enrollment.code");
        if (sysCode != null && !sysCode.trim().isEmpty()) {
            return sysCode.trim();
        }
        return properties.getProperty("agent.enrollment.code", "");
    }

    public static String getAgentId() {
        return agentId;
    }
}
