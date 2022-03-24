import { IFriend, IUser, Status } from "./Interfaces";

class User implements IUser {
  _userID: string;
  _checkInSpot: number;
  _friends: Friend[];

  constructor(userID: string, checkInSpot: number, friends: Friend[]) {
    (this._userID = userID),
      (this._checkInSpot = checkInSpot),
      (this._friends = friends);
  }
}

class Friend implements IFriend {
  _friendID: string;
  _status: Status;

  constructor(friendID: string, status: Status) {
    this._friendID = friendID;
    this._status = status;
  }

  toString(): string {
    return "friendID: " + this._friendID + "\nstatus: " + this._status;
  }
}

export { User, Friend };
