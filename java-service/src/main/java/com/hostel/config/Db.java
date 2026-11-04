package com.hostel.config;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;

public class Db {

    private static final String DEFAULT_URL = "jdbc:postgresql://localhost:5432/hostel_portal";
    private static final String DEFAULT_USER = "postgres";
    private static final String DEFAULT_PASSWORD = "postgres123";

    static {
        try {
            Class.forName("org.postgresql.Driver");
        } catch (ClassNotFoundException e) {
            System.err.println("PostgreSQL JDBC Driver not found: " + e.getMessage());
        }
    }

    public static Connection getConnection() throws SQLException {
        try {
            String url = System.getenv("DB_URL");
            if (url == null || url.trim().isEmpty()) {
                url = DEFAULT_URL;
            }

            String user = System.getenv("DB_USER");
            if (user == null || user.trim().isEmpty()) {
                user = DEFAULT_USER;
            }

            String password = System.getenv("DB_PASS");
            if (password == null || password.trim().isEmpty()) {
                password = DEFAULT_PASSWORD;
            }

            Properties properties = new Properties();
            properties.setProperty("user", user);
            properties.setProperty("password", password);

            return DriverManager.getConnection(url, properties);
        } catch (SQLException e) {
            System.err.println("Database connection failed: " + e.getMessage());
            throw e;
        }
    }
}
