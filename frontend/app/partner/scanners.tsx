import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { colors, spacing, radius, font } from "@/src/theme/tokens";

type Scanner = {
  user_id: string;
  username: string;
  display_name: string;
  avatar?: string;
};

export default function PartnerScanners() {

  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<Scanner[]>([]);

  const load = async () => {

    try {

      const rows = await api.get<Scanner[]>("/partner/scanners");

      setItems(rows);

    } finally {

      setLoading(false);

    }

  };

  useFocusEffect(

    useCallback(() => {

      load();

    }, [])

  );

  const remove = (id: string) => {

    Alert.alert(

      "Remove Scanner",

      "Remove this scanner?",

      [

        {
          text: "Cancel",
          style: "cancel",
        },

        {

          text: "Remove",

          style: "destructive",

          onPress: async () => {

            await api.del(`/partner/scanners/${id}`);

            load();

          },

        },

      ],

    );

  };

  return (

    <SafeAreaView style={styles.wrap}>

      <View style={styles.top}>

        <Pressable onPress={() => router.back()}>

          <Ionicons
            name="chevron-back"
            size={26}
            color={colors.onSurface}
          />

        </Pressable>

        <Text style={styles.title}>

          Scanners

        </Text>

        <Pressable
          onPress={() =>
            router.push("/partner/scan?mode=scanner")
          }
        >

          <Ionicons
            name="add"
            size={26}
            color={colors.brand}
          />

        </Pressable>

      </View>

      {

        loading

        ?

        <ActivityIndicator
          style={{ marginTop:40 }}
        />

        :

        <FlatList

          data={items}

          keyExtractor={(i)=>i.user_id}

          renderItem={({item})=>(

            <View style={styles.row}>

              <Avatar
                alias={item.display_name}
                size={42}
              />

              <View style={{flex:1}}>

                <Text style={styles.name}>

                  {item.display_name}

                </Text>

                <Text style={styles.user}>

                  @{item.username}

                </Text>

              </View>

              <Pressable
                onPress={()=>remove(item.user_id)}
              >

                <Ionicons
                  name="trash-outline"
                  size={22}
                  color={colors.error}
                />

              </Pressable>

            </View>

          )}

        />

      }

    </SafeAreaView>

  );

}

const styles = StyleSheet.create({

wrap:{
flex:1,
backgroundColor:colors.surface,
},

top:{
padding:spacing.md,
flexDirection:"row",
alignItems:"center",
justifyContent:"space-between",
},

title:{
fontWeight:"800",
fontSize:font.lg,
color:colors.onSurface,
},

row:{
padding:spacing.md,
borderBottomWidth:1,
borderColor:colors.border,
flexDirection:"row",
alignItems:"center",
gap:spacing.md,
},

name:{
fontWeight:"700",
color:colors.onSurface,
},

user:{
color:colors.muted,
},

});