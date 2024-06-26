import { firebaseApp } from "../config/FirebaseConfig"
import { getFirestore, collection, getDocs, setDoc, doc, getDoc, updateDoc, deleteDoc, Firestore, query } from 'firebase/firestore/lite';
import { Pin, PinDetails, coordinateToString, coordinateFromString, PinReview, PinPhoto, PinActivity } from "./Pin"
import { IPin, IDatabaseActionResult, IPinActionResult, IDatabase, IUser, IUserActionResult } from "./Interfaces"
import { pinActivityConverter, pinConverter, pinDetailsConverter, pinPhotosConverter, pinReviewsConverter, userConverter, userFriendsConverter } from "./DataConverters";
import { Coordinate, LatLng } from "react-native-maps";
import { onSnapshot, Timestamp } from "@firebase/firestore";
import {
  addPin,
  removePin,
  updatePin,
} from "../redux/PinSlice";
import { store } from "../redux/Store"
import { User, userIsCheckedIntoSpot, Friend } from "./User";

class Database implements IDatabase {
    database: Firestore;

    constructor() {
        this.database = getFirestore(firebaseApp);
    }

    async addUser(user: IUser) {
        try
        {
          const userDocRef = doc(this.database, "users", user._userID)
          const userSnap =await getDoc(userDocRef)
          if(userSnap.exists())
          {
            throw new Error(`User already existed with ID ${user._userID}`)
          }
          await setDoc(userDocRef, {userID: user._userID, checkInSpot: user._checkInSpot, checkOutTime: user._checkOutTime, username:user._username, friends: user._friends})
        } catch (e) {
          console.log("Error adding user: ", e);
        }
    }

    async getAllUsers(): Promise<IUserActionResult<IUser[]>>
    {
      try {
        const pinsCollection = collection(this.database, "users").withConverter(userConverter)
  
        const pinSnapshot = await getDocs(pinsCollection);
  
        const userList: User[] = [];
  
        // converts each document into a pin object
        pinSnapshot.forEach((user) => {
          userList.push(user.data());
        });
  
        return new UserActionResult<IUser[]>(
          new DatabaseActionResult(
            true,
            `Succeeded: users retrieved`
          ),
          userList
        );
      } catch (error) {
        return new UserActionResult<IUser[]>(
          new DatabaseActionResult(
            false,
            `Failed: users could not be retrieved. ${error}`
          ),
          undefined
        );
      }
    }

    async getUser(userID: string): Promise<IUserActionResult<IUser>> {
      try
      {
        const userDocRef = doc(this.database, "users", userID)
        const userDocSnap = await getDoc(userDocRef)
        if (!userDocSnap.exists())
        {
          throw new Error(`User with ID ${userID} doesn't exist`)
        }
        
        const usr = userConverter.fromFirestore(userDocSnap);

        return new UserActionResult<IUser>(
          new DatabaseActionResult(
            true,
            `Succeeded: user ${userDocSnap.get('userID')}`
          ),
          usr
        );
      } catch (error) {
        return new UserActionResult<IUser>(
          new DatabaseActionResult(
            false,
            `Failed: user ${userID} could not be retrieved from the database. ${error}`
          ),
          undefined
        );
      }
    }

    async ChangeCheckInSpot(userID:string, newLocation:LatLng, hoursToCheckInFor: number): Promise<IDatabaseActionResult>
    {
        try
        {
          const userDocRef = doc(this.database, "users", userID)
          const userResult = await this.getUser(userID)
          const user = userResult.data
            const userDocSnap = await getDoc(userDocRef)
            if(!user) {
                throw new Error("User doesn't exist")
            }

            const previousLocation = user._checkInSpot

            if(previousLocation) {
                // exit if user is already checked into new spot
                if(userIsCheckedIntoSpot(user, newLocation)) {
                    throw new Error(`User already checked into spot ${coordinateToString(newLocation)}.`);
                }

                // checkout from previous
                await this.checkoutFromSpot(userID, previousLocation);
            }

            // check into new spot
            await this.checkIntoSpot(userID, newLocation, hoursToCheckInFor);
        }
        catch(error)
        {
            return new DatabaseActionResult(
            false,
            `change check in spot failed for user ${userID}: ${error}`,
            );
        }
        return new DatabaseActionResult(true, `user changed checkin spots`)
        
    }

    // checks a user out from a pin
    async checkoutFromSpot(userID: string, location: LatLng) {
        console.log(`attempt checkoutFromSpot for user ${userID} at location ${coordinateToString(location)}`);
        try {
            const userDocRef = doc(this.database, "users", userID)
            const pinResult = await this.getPin(location);
            const pin = pinResult.data;

            if(pin == undefined) {
                throw new Error(pinResult.message)
            }

            const previousPinActivity = pin.activity;
            const previousPinCheckedInUserIds = previousPinActivity.checkedInUserIds;

            if(previousPinCheckedInUserIds.indexOf(userID) < 0) {
                throw new Error(`user was not checked into spot ${coordinateToString(location)}.`)
            }

            // update the pin's checkout info
            previousPinActivity.checkedInUserIds = previousPinCheckedInUserIds.filter(id => id !== userID);
            previousPinActivity.activeUsers--;
            const editPinActivityResult = await this.editPinActivity(location, previousPinActivity)

            if(!editPinActivityResult.succeeded) {
                throw new Error(editPinActivityResult.message)
            }

            // update the user's checkout info
            await updateDoc(userDocRef, {checkInSpot: null})
            console.log(`end of checkout`);
        }
        catch(error) {
            throw new Error(`checkout from spot failed for user ${userID} at location ${coordinateToString(location)}: ${error}`)
        }
    }

    // checks a user into a pin
    async checkIntoSpot(userID: string, location: LatLng, hoursToCheckinFor: number) {
        console.log(`attempt checkIntoSpot for user ${userID} at location ${coordinateToString(location)}`);
        try {
            const userDocRef = doc(this.database, "users", userID)
            const pinResult = await this.getPin(location);
            const pin = pinResult.data;

            const checkoutDate = new Date();
            console.log(`current date: ${checkoutDate}`);

            // use minutes for testing
            // checkoutDate.setMinutes(checkoutDate.getMinutes() + hoursToCheckinFor);

            // use hours for production
            checkoutDate.setHours(checkoutDate.getHours() + hoursToCheckinFor);
            console.log(`checkout date: ${checkoutDate}`);
        
            if(pin == undefined) {
                throw new Error(pinResult.message)
            }

            const pinActivity = pin.activity;
            const pinCheckedInUserIds = pinActivity.checkedInUserIds;

            // update the pins checkin info
            pinCheckedInUserIds.push(userID);
            pinActivity.activeUsers++;
            pinActivity.totalUsers++;
            const editPinActivityResult = await this.editPinActivity(location, pinActivity);

            if(!editPinActivityResult.succeeded) {
                throw new Error(editPinActivityResult.message)
            }

            // update the user's checkin info
            await updateDoc(userDocRef, {checkInSpot: location, checkOutTime: checkoutDate});
        }
        catch(error) {
            throw new Error(`check into spot failed for user ${userID} at location ${coordinateToString(location)}: ${error}`)
        }
        // can remove after testing
        await this.getCheckInOfUser(userID);
    }

    // will perform checkout task every minutesBetweenCheckoutTask minutes
    async checkoutAllExpiredCheckins(minutesBetweenCheckoutTask: number) {
        const currentDate = new Date();
        let usersWereCheckedOut = false;

        console.log(`attempt checkoutAllExpiredCheckins at ${currentDate}`);
        try {
            const checkInRef = doc(this.database, "tasks", "checkIn");
            const checkInDocSnap = await getDoc(checkInRef);

            if (!checkInDocSnap.exists()) {
                throw new Error(`Could not get checkIn task doc`);
            }

            let lastCheckoutAllExpiredCheckins: Date = checkInDocSnap.data().lastCheckoutAllExpiredCheckins.toDate();
            console.log(`last checkoutAllExpiredCheckins: ${lastCheckoutAllExpiredCheckins}`);

            lastCheckoutAllExpiredCheckins.setMinutes(lastCheckoutAllExpiredCheckins.getMinutes() + minutesBetweenCheckoutTask);
            console.log(`next checkoutAllExpiredUsers in ${minutesBetweenCheckoutTask} minutes, at ${lastCheckoutAllExpiredCheckins}`)

            // only reads the users from the db once every minutesBetweenCheckoutTask minutes
            if(currentDate.getTime() > lastCheckoutAllExpiredCheckins.getTime()) {
                console.log(`running checkoutAllExpiredUsers: ${lastCheckoutAllExpiredCheckins}`);

                const usersResult = await this.getAllUsers();
                const users = usersResult.data;

                updateDoc(checkInRef, {lastCheckoutAllExpiredCheckins: currentDate});
                
                if(!users) {
                    throw new Error(`${usersResult.message}`);
                }

                users.forEach(user => {
                    if(user._checkInSpot && currentDate.getTime() > user._checkOutTime.getTime()) {
                        usersWereCheckedOut = true;
                        console.log(`checking out user: ${user._userID}, from spot: ${coordinateToString(user._checkInSpot)}, with checkout time: ${user._checkOutTime}.`);
                        this.checkoutFromSpot(user._userID, user._checkInSpot);
                    }
                });
            } else {
                console.log(`NOT running checkoutAllExpiredUsers: ${lastCheckoutAllExpiredCheckins}`);
            }
           
        } catch (error) {
            console.log(`could not checkout all expired checkins: ${error}`)
        }
        if(!usersWereCheckedOut) {
            console.log(`no users were checked out`);
        }
    }

    // will try to checkout all expired checkins as often as specified by intervalInMinutes
    // intervalBetweenTasks: how often to run the checkout task (minutes)
    // intervalBetweenRunningCheckoutAllExpiredCheckins: how often to check the checkout status of all users (minutes)
    async checkoutAllExpiredCheckinsTask(minutesBetweenTasks: number, minutesBetweenRunningCheckoutAllExpiredCheckins: number) {
        setInterval(() => this.checkoutAllExpiredCheckins(minutesBetweenRunningCheckoutAllExpiredCheckins), 1000 * 60 * minutesBetweenTasks)
    }

    // to test checkin
    async getCheckInOfUser(userID: string) {
        const userResult = await this.getUser(userID);
        const user = userResult.data;

        if(user) {
            const checkOutTime =  user._checkOutTime;
            console.log(`userID: ${user._userID}, checkout time: ${checkOutTime}`);
            if(user._checkInSpot) {
                 console.log(`checkinSpot: ${coordinateToString(user._checkInSpot)}`);
            } else {
                console.log(`checkInSpot: ${user._checkInSpot}`)
            }
        }
    }

    async deleteUser(userID: string) {
      const userDocRef = doc(this.database, "users", userID)
      try
      {
        const userDocSnap = await getDoc(userDocRef)
        if (!userDocSnap.exists())
        {
          throw new Error(`User with ID ${userID} doesn\'t exist`)
        }
        await deleteDoc(userDocRef)
      }
      catch(error)
      {
        console.log(`delete user failed: ${error}`)
      }
    }
  
  async editFriends(userID: string, newFriends: Friend[]) {
    try {
      const userDocRef = doc(this.database, "users", userID)
      const userDocSnap = await getDoc(userDocRef)
      if(!userDocSnap.exists()) {
        throw new Error("User doesn't exist")
      }
      
      updateDoc(userDocRef, {friends: userFriendsConverter.toFirestore(newFriends)})
    } catch(error) {
      return new DatabaseActionResult(
          false,
          `Failed: could not add friend to user: ${userID}. ${error}`
        );
    }
    return new DatabaseActionResult(
          true,
          `Succeeded: friend added to user: ${userID}`
        );
  }
   

    // Adds a pin to the database
    async addPin(pin: IPin): Promise<IDatabaseActionResult> {
        try {
            const pinRef = doc(this.database, "pins", coordinateToString(pin.coordinate));
            const pinDocSnap = await getDoc(pinRef);

            if (pinDocSnap.exists()) {
                throw new Error(`Pin already exists.`);
            }

            await setDoc(pinRef, pinConverter.toFirestore(pin));
        } catch (error) {
        return new DatabaseActionResult(
          false,
          `Failed: could not place pin at coordinate: ${coordinateToString(
            pin.coordinate
          )}. ${error}`
        );
        }

        return new DatabaseActionResult(
          true,
          `Succeeded: pin added at ${coordinateToString(pin.coordinate)}`
        );
    }

    // Edits pin details at coordinate
    async editPinDetails(coordinate: LatLng,details: PinDetails): Promise<IDatabaseActionResult> {
        try {
        const pinRef = doc(this.database, "pins", coordinateToString(coordinate));
        const pinDocSnap = await getDoc(pinRef);

        if (!pinDocSnap.exists()) {
            throw new Error(`Pin could not be found.`);
        }

        await updateDoc(pinRef, { details: pinDetailsConverter.toFirestore(details) });
        } catch (error) {
        return new DatabaseActionResult(
          false,
          `Failed: could not edit pin at coordinate ${coordinateToString(coordinate)}. ${error}`);
        }

        return new DatabaseActionResult(true, `Succeeded: pin edited at ${coordinateToString(coordinate)}`);
    }
  
  // Edits pin reviews at coordinate
  async editPinReviews(coordinate: LatLng, reviews: PinReview[]): Promise<IDatabaseActionResult> {
    try {
      const pinRef = doc(this.database, "pins", coordinateToString(coordinate));
      const pinDocSnap = await getDoc(pinRef);

      if (!pinDocSnap.exists()) {
        throw new Error(`Pin could not be found.`);
      }

      await updateDoc(pinRef, {
        reviews: pinReviewsConverter.toFirestore(reviews),
      });
    } catch (error) {
      return new DatabaseActionResult(
        false,
        `Failed: could not edit pin reviews at coordinate ${coordinateToString(
          coordinate
        )}. ${error}`
      );
    }

    return new DatabaseActionResult(
      true,
      `Succeeded: pin reviews edited at ${coordinateToString(coordinate)}`
    );
  }

  // Edits pin photos at coordinate
  async editPinPhotos(coordinate: LatLng, photos: PinPhoto[]): Promise<IDatabaseActionResult> {
    try {
      const pinRef = doc(this.database, "pins", coordinateToString(coordinate));
      const pinDocSnap = await getDoc(pinRef);

      if (!pinDocSnap.exists()) {
        throw new Error(`Pin could not be found.`);
      }

      await updateDoc(pinRef, {
        photos: pinPhotosConverter.toFirestore(photos),
      });
    } catch (error) {
      return new DatabaseActionResult(
        false,
        `Failed: could not edit pin photos at coordinate ${coordinateToString(
          coordinate
        )}. ${error}`
      );
    }

    return new DatabaseActionResult(
      true,
      `Succeeded: pin photos edited at ${coordinateToString(coordinate)}`
    );
  }

    // Edits pin activity at coordinate
    async editPinActivity(coordinate: LatLng, activity: PinActivity): Promise<IDatabaseActionResult> {
      try {
      const pinRef = doc(this.database, "pins", coordinateToString(coordinate));
      const pinDocSnap = await getDoc(pinRef);

      if (!pinDocSnap.exists()) {
          throw new Error(`Pin could not be found.`);
      }

      await updateDoc(pinRef, { activity: pinActivityConverter.toFirestore(activity) });
      } catch (error) {
      return new DatabaseActionResult(
        false,
        `Failed: could not edit pin activity at coordinate ${coordinateToString(coordinate)}. ${error}`);
      }

      return new DatabaseActionResult(true, `Succeeded: pin activity edited at ${coordinateToString(coordinate)}`);
  }

  // Edits pin details at coordinate
  async editPinFavorites(coordinate: LatLng, favorites: string[]): Promise<IDatabaseActionResult> {
    try {
      const pinRef = doc(this.database, "pins", coordinateToString(coordinate));
      const pinDocSnap = await getDoc(pinRef);

      if (!pinDocSnap.exists()) {
        throw new Error(`Pin could not be found.`);
      }

      await updateDoc(pinRef, { favoriteUsers: favorites });
    } catch (error) {
      return new DatabaseActionResult(
        false,
        `Failed: could not edit pin at coordinate ${coordinateToString(
          coordinate
        )}. ${error}`
      );
    }

    return new DatabaseActionResult(
      true,
      `Succeeded: pin edited at ${coordinateToString(coordinate)}`
    );
  }

    // Deletes pin at given coordinate
    async deletePin(coordinate: LatLng): Promise<IDatabaseActionResult> {
        try {
            const pinRef = doc(this.database, "pins", coordinateToString(coordinate));
            const pinDocSnap = await getDoc(pinRef);

            if (!pinDocSnap.exists()) {
                throw new Error(`Pin could not be found.`);
            }
            await deleteDoc(pinRef);

        } catch (error) {

        return new DatabaseActionResult(false, `Failed: could not delete pin at coordinate ${coordinateToString(coordinate)}. ${error}`);

        }

        return new DatabaseActionResult(
        true,
        `Succeeded: pin deleted at: ${coordinateToString(coordinate)}`
        );
    }

    // Get the pin at a given coordinate
    async getPin(coordinate: LatLng): Promise<IPinActionResult<IPin>> {
        try {
        const pinRef = doc(this.database, "pins", coordinateToString(coordinate));

        const pinDocSnap = await getDoc(pinRef);

        if (!pinDocSnap.exists()) {
            throw new Error(`Pin could not be found`);
        }

        const pin = pinConverter.fromFirestore(pinDocSnap);

        return new PinActionResult<IPin>(
          new DatabaseActionResult(
            true,
            `Succeeded: pin retrieved from ${coordinateToString(coordinate)}`
          ),
          pin
        );
        } catch (error) {
        return new PinActionResult<IPin>(
            new DatabaseActionResult(
            false,
            `Failed: pin could not be retrieved from ${coordinateToString(coordinate)}. ${error}`
            ),
            undefined
        );
        }
    }

  // Get a pin[] of all pins from the database
  async getAllPins(): Promise<IPinActionResult<IPin[]>> {
    try {
      const pinsCollection = collection(this.database, "pins").withConverter(
        pinConverter
      );

      const pinSnapshot = await getDocs(pinsCollection);

      const pinsList: Pin[] = [];

      // converts each document into a pin object
      pinSnapshot.forEach((pin) => {
        pinsList.push(pin.data());
      });

      return new PinActionResult<IPin[]>(
        new DatabaseActionResult(
          true,
          `Succeeded: pins retrieved`
        ),
        pinsList
      );
    } catch (error) {
      return new PinActionResult<IPin[]>(
        new DatabaseActionResult(
          false,
          `Failed: pins could not be retrieved. ${error}`
        ),
        undefined
      );
    }
  }

  // Get a coordinate[] of all pins from the database without retreiving details
  // Use getPin to get a specific pin
  async getAllPinCoordinates(): Promise<IPinActionResult<LatLng[]>> {
    try {
      const pinsCollection = collection(this.database, "pins");

      const pinSnapshot = await getDocs(pinsCollection);

      const pinsList = pinSnapshot.docs.map((doc) => doc.id);

      const pinCoordinatesList: LatLng[] = [];

      pinsList.forEach((pin) => {
        pinCoordinatesList.push(coordinateFromString(pin));
      });

      return new PinActionResult<LatLng[]>(
        new DatabaseActionResult(
          true,
          `Succeeded: pin coordinates retrieved.`
        ),
        pinCoordinatesList
      );
    } catch (error) {
      return new PinActionResult<LatLng[]>(
        new DatabaseActionResult(
          false,
          `Failed: pin coordinates could not be retrieved. ${error}`
        ),
        undefined
      );
    }
  }

// creates a listener for changes to the db
// should update the state of the store dependent on changes
// returns a subscriber that can be called to unsubcribe from changes
// https://firebase.google.com/docs/firestore/query-data/listen
 async monitorDatabaseChanges() {
    const pinsCollection = collection(this.database, "pins");
    const pinSnapshot = await getDocs(pinsCollection);
    const q = query(pinsCollection);

    return onSnapshot(pinsCollection, (snapshot) => {

        snapshot.docChanges().forEach((change) => {
            const pin = pinConverter.fromFirestore(change.doc); 
            console.log(`change: ${change}`);
            if(change.type === "added") {
                store.dispatch(addPin(pin));
            }
            else if(change.type === "modified") {
                store.dispatch(updatePin(pin));
            } else if(change.type === "removed") {
                store.dispatch(removePin(pin));
            }
        })
    })
  }

  async updatePinActivity() {
      
  }
}

// action result implementations

class DatabaseActionResult implements IDatabaseActionResult {
    readonly succeeded: boolean;
    readonly message: string;

    constructor(succeeded: boolean, message: string) {
        this.succeeded = succeeded;
        this.message = message;
    }
}

class PinActionResult<T> implements IPinActionResult<T> {
    succeeded: boolean;
    message: string;
    data?: T;

    constructor(result: IDatabaseActionResult, data?: T) {
        this.succeeded = result.succeeded;
        this.message = result.message;
        this.data = data;
    }
}

class UserActionResult<T> implements IUserActionResult<T> {
    succeeded: boolean;
    message: string;
    data?: T;

    constructor(result: IDatabaseActionResult, data?: T) {
        this.succeeded = result.succeeded;
        this.message = result.message;
        this.data = data;
    }
}

export { Database };