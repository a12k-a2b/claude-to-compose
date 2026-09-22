package com.claude.noteapp.data

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromTagsList(tags: List<String>?): String {
        return tags?.joinToString(separator = ",") ?: ""
    }

    @TypeConverter
    fun toTagsList(data: String?): List<String> {
        if (data.isNullOrEmpty()) return emptyList()
        return data.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    }
}
