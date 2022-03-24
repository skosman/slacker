import { assert } from "@firebase/util";
import { deleteUser } from "firebase/auth";
import { Database } from "../data/Database";
import { User } from "../data/User";

const userID1 = "1"
const UpdatedCheckInSPot = 27
const user1 = new User(userID1, 0, []);

async function testUser() {
  const db = new Database();
  var retrievedUser = await db.getUser(userID1);

  if (retrievedUser._userID == userID1) {
    await db.deleteUser(userID1);
  }

  await db.addUser(new User(userID1, 0, []));

  var retrievedUser = await db.getUser(userID1);

  console.log(retrievedUser._userID, userID1);

  await db.ChangeCheckInSpot(userID1, UpdatedCheckInSPot);

  retrievedUser = await db.getUser(userID1);

  console.log(retrievedUser._checkInSpot, UpdatedCheckInSPot);
}


export default testUser
