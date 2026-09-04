import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../lib/ThemeContext";
import { SettingsProvider } from "../../lib/SettingsContext";
import { db } from "../../lib/db";
import UsersTab from "./UsersTab";

function renderUsersTab() {
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <UsersTab />
      </SettingsProvider>
    </ThemeProvider>
  );
}

async function addUser(user, name) {
  await user.type(screen.getByLabelText("Full name"), name);
  await user.type(screen.getByLabelText("PIN (4-6 digits)"), "1234");
  await user.click(screen.getByRole("button", { name: /add user/i }));
}

describe("TechDesk Enterprise unlimited staff accounts", () => {
  beforeEach(() => localStorage.clear());

  it("has no cap on staff accounts (past Business's limit of 3)", async () => {
    const user = userEvent.setup();
    renderUsersTab();

    for (const name of ["Alice", "Bob", "Cara", "Dan", "Eve"]) {
      await addUser(user, name);
    }

    expect(db.getUsers()).toHaveLength(5);
    expect(screen.getByText("Unlimited staff accounts")).toBeInTheDocument();
    expect(screen.queryByText("Staff account limit reached")).not.toBeInTheDocument();
    // the add-user form must still be present after the 3rd account (Business's cap)
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });
});
