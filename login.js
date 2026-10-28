document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("loginError");
    const loginSuccess = document.getElementById("loginSuccess");
    const loginButton = document.getElementById("loginButton");

    // Detect an incorrect HTML/JavaScript connection.
    if (!loginForm || !loginError || !loginSuccess || !loginButton) {
        console.error(
            "Login elements not found. Check the IDs in login.html."
        );
        alert("Login setup error. Check login.html and login.js.");
        return;
    }

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        loginError.hidden = true;
        loginSuccess.hidden = true;

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const role = document.getElementById("loginRole").value;

        if (!email || !password || !role) {
            loginError.textContent = "Please enter your email, password, and role.";
            loginError.hidden = false;
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "Logging in...";

        try {
            const response = await fetch("http://localhost:3000/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password, role })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Login failed.");
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            loginSuccess.textContent = "Login successful! Opening dashboard...";
            loginSuccess.hidden = false;

            const dashboards = {
                donor: "donor-dashboard.html",
                recipient: "recipient-dashboard.html",
                admin: "admin-dashboard.html"
            };

            const destination = dashboards[data.user.role];

            if (!destination) {
                throw new Error("No dashboard is configured for this account.");
            }

            // Give the success message time to appear.
            window.setTimeout(() => {
                window.location.href = destination;
            }, 500);

        } catch (error) {
            console.error("Login error:", error);

            loginError.textContent =
                error instanceof TypeError
                    ? "Cannot connect to the backend. Check that server.js is running on port 3000."
                    : error.message;

            loginError.hidden = false;

        } finally {
            loginButton.disabled = false;
            loginButton.textContent = "Login";
        }
    });
});