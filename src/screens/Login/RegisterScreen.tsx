import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Text } from "react-native-elements";
import { auth } from "../../config/FirebaseConfig";
import { Database } from "../../data/Database";
import { User } from "../../data/User";
import { defaultColor, defaultStyles } from "../../style/styles";

export const RegisterScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const handleSignUp = async () => {
    const db = new Database();
    try {
      const allUsers = await db.getAllUsers();
      if (allUsers.data != undefined) {
        allUsers.data?.forEach((user) => {
          if (user._username == username) {
            alert("username already existed!");
            throw new Error("");
          }
        });
      }
    } catch (error) {
      return;
    }
    createUserWithEmailAndPassword(auth, email.trimEnd(), password)
      .then(async (userCredentials) => {
        const user = userCredentials.user;
        db.addUser(new User(user.uid, null, new Date(), username, []));
        navigation.push("Main");
      })
      .catch((error) => alert(error.message));
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.inputContainer}>
        <Text style={styles.title} h4>
          Please enter your details here
        </Text>
        <TextInput
          placeholder="Email"
          value={email}
          autoCapitalize="none"
          onChangeText={(text) => setEmail(text)}
          style={styles.input}
        />
        <TextInput
          placeholder="Username"
          value={username}
          autoCapitalize="none"
          onChangeText={(text) => setUsername(text)}
          style={styles.input}
        />
        <TextInput
          placeholder="Password"
          value={password}
          autoCapitalize="none"
          onChangeText={(text) => setPassword(text)}
          style={styles.input}
          secureTextEntry
        />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          onPress={handleSignUp}
          style={[styles.button, styles.buttonOutline]}
        >
          <Text style={styles.buttonOutlineText}>Register</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  inputContainer: {
    width: "80%",
  },
  input: {
    backgroundColor: "white",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 5,
  },
  buttonContainer: {
    width: "60%",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 40,
  },
  button: {
    backgroundColor: defaultColor,
    width: "100%",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonOutline: {
    backgroundColor: "white",
    marginTop: 5,
    borderColor: defaultColor,
    borderWidth: 2,
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  buttonOutlineText: {
    color: defaultColor,
    fontWeight: "700",
    fontSize: 16,
  },
  title: {
    padding: 40,
    paddingBottom: 10,
    fontSize: 18,
    color: defaultColor,
    textAlign: "center",
  },
});
