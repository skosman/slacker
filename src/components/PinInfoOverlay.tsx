import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Animated,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, Divider, Button, Icon } from "react-native-elements";
import SlidingUpPanel from "rn-sliding-up-panel";
import ReviewCard from "./ReviewCard";
import { Pin, PinPhoto, PinReview } from "../data/Pin";
import PhotoItem from "./PhotoItem";
import { auth } from "../config/FirebaseConfig";
import { LatLng } from "react-native-maps";
import { Database } from "../data/Database";
import {
  defaultColor,
  hotColor,
  mintColor,
} from "../style/styles";
import { userIsCheckedIntoSpot } from "../data/User";
import { useToast } from "react-native-toast-notifications";

const ios = Platform.OS === "ios";
const TOP_NAV_BAR = 100;
const BOTTOM_NAV_BAR = 140;
const database = new Database();

function PinInfoOverlay(prop: { pin: Pin; navigation: any }) {
  const pin = prop.pin;
  const navigation = prop.navigation;
  const reviews = pin.reviews;
  const photos = pin.photos;
  const user = auth.currentUser;
  const isPinFavorite = () => {
    if (user) return pin.favoriteUsers.includes(user?.uid);
  };
  const [favorite, setFavorite] = useState(isPinFavorite());
  const toast = useToast();

  // strange calculation here to get the top of the draggable range correct
  const insets = useSafeAreaInsets();
  const statusBarHeight: number = ios ? insets.bottom : insets.top;
  const deviceHeight =
    useWindowDimensions().height - statusBarHeight - TOP_NAV_BAR;
  const draggableRange = {
    top: deviceHeight - statusBarHeight,
    bottom: BOTTOM_NAV_BAR,
  };

  const snappingPoints = [draggableRange.top, draggableRange.bottom];
  const panelRef = useRef<SlidingUpPanel | null>(null);
  const [dragging, setDragging] = useState(true);

  const [panelPositionVal] = useState(
    new Animated.Value(draggableRange.bottom)
  );

  const [isCheckedIn, setCheckedIn] = useState(false);

  useEffect(() => {
    checkedIn(pin.coordinate, user?.uid).then((checkedIn) => {
      // console.log(`checkedIn in useEffect ${checkedIn}`)
      setCheckedIn(checkedIn);
    });
  }, [pin]);

  const handleCheckIn = (
    pinCoords: LatLng,
    userId: string | undefined,
    pinTitle: string
  ) => {
    try {
      if (userId) {
        const userPromise = database.getUser(userId);
        userPromise.then((result) => {
          const usr = result.data;

          if (usr?._checkInSpot) {
            if (userIsCheckedIntoSpot(usr, pinCoords)) {
              navigation.navigate("Map");
              toast.show(
                `You are already checked into ${
                  pin.details.title != "" ? pin.details.title : "this spot"
                }!`,
                {
                  type: "danger",
                }
              );
              return;
            }
          }
          navigation.navigate("Check-In Details", { pinCoords, usr, pinTitle });
        });
      } else {
        toast.show("You must be signed in to use this feature!", {
          type: "danger",
        });
      }
    } catch (error) {
      console.log(`${error}`);
      navigation.navigate("Map");
      toast.show("Whoops! Checkin failed", {
        type: "danger",
      });
    }
  };

  const handleCheckOut = (pinCoords: LatLng, userId: string | undefined) => {
    try {
      if (userId) {
        const userPromise = database.getUser(userId);
        userPromise.then((result) => {
          const usr = result.data;

          if (usr?._checkInSpot) {
            if (!userIsCheckedIntoSpot(usr, pinCoords)) {
              navigation.navigate("Map");
              toast.show(
                `You are not checked into ${
                  pin.details.title != "" ? pin.details.title : "this spot"
                }`,
                {
                  type: "danger",
                }
              );
              return;
            }

            // checkout and use dispatch to rerender pin
            database.checkoutFromSpot(usr._userID, pinCoords).then(() => {
              navigation.navigate("Map");
              toast.show(
                `Checked out of ${
                  pin.details.title != "" ? pin.details.title : "spot"
                }!`,
                {
                  type: "success",
                }
              );
            });
          }
        });
      } else {
        toast.show("You must be signed in to use this feature", {
          type: "danger",
        });
      }
    } catch (error) {
      console.log(`${error}`);
      navigation.navigate("Map");
      toast.show("Whoops! Checkout failed", {
        type: "danger",
      });
    }
  };

  const checkedIn = async (
    pinCoords: LatLng,
    userId: string | undefined
  ): Promise<boolean> => {
    if (userId) {
      const checkedIn = database.getUser(userId).then((result) => {
        const usr = result.data;
        if (usr) {
          const checked = userIsCheckedIntoSpot(usr, pinCoords);
          return userIsCheckedIntoSpot(usr, pinCoords);
        }
        return false;
      });
      return checkedIn;
    }

    return false;
  };

  const handleFavorite = () => {
    let newFavorites: string[] = [...pin.favoriteUsers];

    if (favorite) {
      newFavorites = newFavorites.filter((usr) => {
        return usr != user?.uid;
      });
    } else {
      if (!user) alert("You need to be logged in!");
      else {
        newFavorites.push(user?.uid || "");
      }
    }

    database
      .editPinFavorites(pin.coordinate, newFavorites)
      .then(() => {
        setFavorite(!favorite);
      })
      .finally(() => {
        pin.favoriteUsers = [...newFavorites];
        const notification = {
          msg: "Added pin to favorites!",
          type: "success",
        };
        if (favorite) {
          (notification.msg = "Removed pin from favorites!"),
            (notification.type = "normal");
        }
        toast.show(notification.msg, { type: notification.type });
      });
  };

  return (
    <SlidingUpPanel
      ref={panelRef}
      animatedValue={panelPositionVal}
      draggableRange={draggableRange}
      snappingPoints={snappingPoints}
      backdropOpacity={0}
      containerStyle={styles.panelContainer}
      showBackdrop={false}
      height={deviceHeight}
      allowDragging={dragging}
      friction={0.999}
    >
      <View style={styles.panelContent}>
        <Icon
          name="horizontal-rule"
          type="material"
          color={mintColor}
          containerStyle={{ padding: 0, margin: 0 }}
        />
        <View style={styles.container}>
          <View style={styles.inlineContainer}>
            <Text h4>{pin.details.title}</Text>
            <Icon
              name={favorite ? "favorite" : "favorite-border"}
              type="material"
              color={hotColor}
              onPress={handleFavorite}
            />
          </View>
          <Text>{pin.details.slacklineType}</Text>
          <Text>{pin.details.slacklineLength}m</Text>
          <View style={styles.buttonsContainer}>
            <View style={styles.buttonContainer}>
              <Button
                title={isCheckedIn ? "Check Out" : "Check In"}
                icon={{
                  name: "angle-double-right",
                  type: "font-awesome",
                  size: 20,
                  color: "white",
                }}
                iconRight
                buttonStyle={{
                  backgroundColor: defaultColor,
                  borderWidth: 2,
                  borderColor: "white",
                  borderRadius: 30,
                }}
                containerStyle={{
                  marginRight: 10,
                }}
                titleStyle={{ fontSize: 14 }}
                onPress={() =>
                  isCheckedIn
                    ? handleCheckOut(pin.coordinate, user?.uid)
                    : handleCheckIn(
                        pin.coordinate,
                        user?.uid,
                        pin.details.title
                      )
                }
              />
            </View>
            <View style={styles.buttonContainer}>
              <Button
                title="Add Review"
                buttonStyle={{
                  backgroundColor: "white",
                  borderWidth: 1,
                  borderColor: defaultColor,
                  borderRadius: 30,
                }}
                type="outline"
                containerStyle={{
                  marginRight: 10,
                }}
                titleStyle={{ fontSize: 14, color: defaultColor }}
                onPress={(e) => {
                  navigation.navigate("Add a Review", {
                    pin: pin,
                  });
                }}
              />
            </View>
            <View style={styles.buttonContainer}>
              <Button
                title="Add Photos"
                buttonStyle={{
                  backgroundColor: "white",
                  borderWidth: 1,
                  borderColor: defaultColor,
                  borderRadius: 30,
                }}
                type="outline"
                containerStyle={{
                  marginRight: 10,
                }}
                titleStyle={{ fontSize: 14, color: defaultColor }}
                onPress={(e) => {
                  navigation.navigate("Add a Photo", {
                    pin: pin,
                  });
                }}
              />
            </View>
          </View>
          <View>
            <Divider style={styles.divider} />
            {photos.length != 0 ? (
              <ScrollView horizontal={true}>
                {photos.map((photo: PinPhoto) => (
                  <PhotoItem photo={photo} key={photo.url} />
                ))}
              </ScrollView>
            ) : (
              <View>
                <Text style={styles.subTitle}>Photos</Text>
                <Text style={styles.text}>
                  Share your photos using the button above!
                </Text>
              </View>
            )}
          </View>
          <View>
            <Divider style={styles.divider} />
            <View style={styles.infoContainer}>
              <Text style={styles.subTitle}>Details</Text>
              <Text style={styles.text}>{pin.details.description}</Text>
              <Text style={styles.text}>
                Active Slackliners: {pin.activity.activeUsers}
              </Text>
              <Text style={styles.text}>
                Total People Visited: {pin.activity.totalUsers}
              </Text>
              <Text style={styles.text}>
                {pin.activity.shareableSlackline
                  ? "Slacklining gear is available to share!"
                  : "Please bring your own gear!"}
              </Text>
            </View>
            <Divider />

            <Text style={styles.subTitle}>Reviews</Text>
            {reviews.length != 0 ? (
              <ScrollView
                onTouchStart={() => setDragging(false)}
                onTouchEnd={() => setDragging(true)}
                onTouchCancel={() => setDragging(true)}
              >
                {reviews.map((review: PinReview) => (
                  <ReviewCard review={review} key={review.key} />
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.text}>
                No reviews yet... want to add the first one?
              </Text>
            )}
          </View>
          <Divider style={styles.divider} />
        </View>
      </View>
    </SlidingUpPanel>
  );
}

const styles = StyleSheet.create({
  panelContent: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "white",
  },
  panelContainer: {
    borderRadius: 25,
    shadowColor: "#171717",
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  container: {
    flex: 1,
    marginHorizontal: 16,
  },
  buttonsContainer: {
    flexDirection: "row",
    marginTop: 10,
  },
  buttonContainer: {
    flex: 1,
  },
  infoContainer: {
    paddingBottom: 10,
  },
  inlineContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  subTitle: {
    fontSize: 20,
    color: defaultColor,
    padding: 10,
    paddingBottom: 4,
    paddingLeft: 4,
  },
  smallText: {
    fontSize: 12,
    paddingVertical: 4,
  },
  text: {
    padding: 2,
    paddingLeft: 4,
  },
  divider: {
    paddingBottom: 14,
  },
});

export default PinInfoOverlay;
