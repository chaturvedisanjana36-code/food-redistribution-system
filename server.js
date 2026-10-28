const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 3000;
const JWT_SECRET =
    process.env.JWT_SECRET || "demo-secret-change-before-deployment";

app.use(cors());
app.use(express.json());

// Temporary in-memory demo data
const users = [];
const foodItems = [
    {
        id: 1,
        name: "Fresh Vegetable Meals",
        category: "Cooked Food",
        quantity: 25,
        unit: "meals",
        location: "Aliganj, Lucknow",
        donorId: 1,
        donorName: "Green Kitchen",
        description: "Fresh vegetarian meals prepared today.",
        status: "available"
    },
    {
        id: 2,
        name: "Packaged Bread",
        category: "Bakery",
        quantity: 30,
        unit: "packs",
        location: "Hazratganj, Lucknow",
        donorId: 1,
        donorName: "Green Kitchen",
        description: "Sealed bread packages available for pickup.",
        status: "available"
    },
    {
        id: 3,
        name: "Fresh Seasonal Fruits",
        category: "Fruits",
        quantity: 15,
        unit: "kg",
        location: "Gomti Nagar, Lucknow",
        donorId: 1,
        donorName: "Green Kitchen",
        description: "Fresh seasonal fruits for distribution.",
        status: "available"
    }
];

const requests = [];
let nextUserId = 1;
let nextFoodId = 4;
let nextRequestId = 1;

function publicUser(user) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
}

function authenticate(req, res, next) {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = users.find(user => user.id === payload.id);

        if (!req.user) {
            return res.status(401).json({
                message: "Account not found."
            });
        }

        next();
    } catch {
        return res.status(401).json({
            message: "Invalid or expired session."
        });
    }
}

function allowRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You do not have permission."
            });
        }
        next();
    };
}

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Food Redistribution System API is running."
    });
});

// Register donor or recipient
app.post("/api/register", async (req, res) => {
    try {
        const {
            fullName,
            email,
            password,
            phone,
            location,
            role,
            organizationName,
            organizationType
        } = req.body;

        if (
            !fullName || !email || !password || !phone ||
            !location || !role || !organizationName ||
            !organizationType
        ) {
            return res.status(400).json({
                message: "Please complete all required fields."
            });
        }

        if (!["donor", "recipient"].includes(role)) {
            return res.status(400).json({
                message: "Only donors and recipients can register."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (users.some(user => user.email === normalizedEmail)) {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = {
            id: nextUserId++,
            name: fullName.trim(),
            email: normalizedEmail,
            passwordHash,
            phone,
            location,
            role,
            organizationName,
            organizationType,
            verified: false,
            createdAt: new Date().toISOString()
        };

        users.push(user);

        res.status(201).json({
            message: "Registration successful. Awaiting admin verification.",
            user: publicUser(user)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Registration failed."
        });
    }
});

// Login
app.post("/api/login", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "").trim().toLowerCase();

    const user = users.find(item => item.email === email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({
            message: "Incorrect email or password."
        });
    }

    if (role && role !== user.role) {
        return res.status(403).json({
            message: "Selected role does not match this account."
        });
    }

    if (!user.verified) {
        return res.status(403).json({
            message: "Your account is awaiting admin verification."
        });
    }

    const token = jwt.sign(
        { id: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: "8h" }
    );

    res.json({
        message: "Login successful.",
        token,
        user: publicUser(user)
    });
});

// Get food listings; supports ?q=bread&category=Bakery
app.get("/api/food", (req, res) => {
    const query = String(req.query.q || "").toLowerCase();
    const category = String(req.query.category || "").toLowerCase();
    const location = String(req.query.location || "").toLowerCase();

    const items = foodItems.filter(food =>
        food.status === "available" &&
        (!query ||
            food.name.toLowerCase().includes(query) ||
            food.description.toLowerCase().includes(query)) &&
        (!category || food.category.toLowerCase() === category) &&
        (!location || food.location.toLowerCase().includes(location))
    );

    res.json({ items });
});

// Add food — donor only
app.post(
    "/api/food",
    authenticate,
    allowRoles("donor"),
    (req, res) => {
        const {
            name,
            category,
            quantity,
            unit,
            location,
            description
        } = req.body;

        if (
            !name || !category || !unit || !location ||
            !Number.isFinite(Number(quantity)) ||
            Number(quantity) <= 0
        ) {
            return res.status(400).json({
                message: "Enter valid food details and quantity."
            });
        }

        const item = {
            id: nextFoodId++,
            name,
            category,
            quantity: Number(quantity),
            unit,
            location,
            donorId: req.user.id,
            donorName: req.user.organizationName,
            description: description || "",
            status: "available",
            createdAt: new Date().toISOString()
        };

        foodItems.push(item);

        res.status(201).json({
            message: "Food listing added successfully.",
            item
        });
    }
);

// Request food — recipient only
app.post(
    "/api/requests",
    authenticate,
    allowRoles("recipient"),
    (req, res) => {
        const foodId = Number(req.body.foodId);
        const food = foodItems.find(
            item => item.id === foodId && item.status === "available"
        );

        if (!food) {
            return res.status(404).json({
                message: "Food listing is unavailable."
            });
        }

        const existingRequest = requests.find(request =>
            request.foodId === foodId &&
            request.recipientId === req.user.id &&
            ["pending", "accepted"].includes(request.status)
        );

        if (existingRequest) {
            return res.status(409).json({
                message: "You already requested this food."
            });
        }

        const request = {
            id: nextRequestId++,
            foodId: food.id,
            foodName: food.name,
            donorId: food.donorId,
            recipientId: req.user.id,
            recipientName: req.user.organizationName,
            status: "pending",
            createdAt: new Date().toISOString()
        };

        requests.push(request);

        res.status(201).json({
            message: "Pickup request submitted.",
            request
        });
    }
);

// View requests for the logged-in user
app.get("/api/requests", authenticate, (req, res) => {
    const result = requests.filter(request =>
        req.user.role === "admin" ||
        (req.user.role === "donor" && request.donorId === req.user.id) ||
        (req.user.role === "recipient" && request.recipientId === req.user.id)
    );

    res.json({ requests: result });
});

// Donor accepts or rejects a pickup request
app.patch(
    "/api/requests/:id",
    authenticate,
    allowRoles("donor", "admin"),
    (req, res) => {
        const request = requests.find(
            item => item.id === Number(req.params.id)
        );

        if (!request) {
            return res.status(404).json({
                message: "Request not found."
            });
        }

        if (
            req.user.role === "donor" &&
            request.donorId !== req.user.id
        ) {
            return res.status(403).json({
                message: "This request belongs to another donor."
            });
        }

        const status = req.body.status;

        if (!["accepted", "rejected"].includes(status)) {
            return res.status(400).json({
                message: "Status must be accepted or rejected."
            });
        }

        request.status = status;
        request.updatedAt = new Date().toISOString();

        res.json({
            message: `Request ${status}.`,
            request
        });
    }
);

// Admin: review registrations
app.get(
    "/api/admin/applications",
    authenticate,
    allowRoles("admin"),
    (req, res) => {
        const applications = users
            .filter(user => user.role !== "admin")
            .map(user => ({
                ...publicUser(user),
                verificationStatus: user.verified ? "approved" : "pending"
            }));

        res.json({ applications });
    }
);

// Admin: approve or reject a user
app.patch(
    "/api/admin/users/:id/verification",
    authenticate,
    allowRoles("admin"),
    (req, res) => {
        const user = users.find(
            item => item.id === Number(req.params.id) &&
                    item.role !== "admin"
        );

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        if (typeof req.body.approved !== "boolean") {
            return res.status(400).json({
                message: "Send approved as true or false."
            });
        }

        user.verified = req.body.approved;

        res.json({
            message: user.verified ? "Account approved." : "Account disabled.",
            user: publicUser(user)
        });
    }
);

// Dashboard statistics
app.get("/api/stats", (req, res) => {
    res.json({
        totalFoodListings: foodItems.length,
        availableListings: foodItems.filter(
            item => item.status === "available"
        ).length,
        totalRequests: requests.length,
        pendingRequests: requests.filter(
            item => item.status === "pending"
        ).length,
        approvedUsers: users.filter(
            user => user.role !== "admin" && user.verified
        ).length
    });
});

// Seed demo users
async function startServer() {
    const demoAccounts = [
        {
            name: "Demo Donor",
            email: "donor@example.com",
            password: "DonorDemo123!",
            role: "donor",
            organizationName: "Green Kitchen",
            organizationType: "restaurant"
        },
        {
            name: "Demo Recipient",
            email: "recipient@example.com",
            password: "RecipientDemo123!",
            role: "recipient",
            organizationName: "Helping Hands NGO",
            organizationType: "ngo"
        },
        {
            name: "Demo Admin",
            email: "admin@example.com",
            password: "AdminDemo123!",
            role: "admin",
            organizationName: "Food Redistribution System",
            organizationType: "admin"
        }
    ];

    for (const account of demoAccounts) {
        users.push({
            id: nextUserId++,
            ...account,
            passwordHash: await bcrypt.hash(account.password, 10),
            location: "Lucknow",
            phone: "",
            verified: true
        });
    }

    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log("Demo accounts:");
        console.log("Donor: donor@example.com / DonorDemo123!");
        console.log("Recipient: recipient@example.com / RecipientDemo123!");
        console.log("Admin: admin@example.com / AdminDemo123!");
        console.log("Demo data resets whenever the server restarts.");
    });
}

startServer();